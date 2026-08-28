/**
 * Etapa 18, Task 4 (integracao) — a historia inteira do inventario, lida pelo log.
 *
 * As Tasks 1 e 2 provaram cada ato ISOLADO (uma linha nasce, com os campos certos) e o gate da
 * rota de leitura. Este arquivo prova o que nenhuma delas prova: a COMPOSICAO e a ORDEM. Um
 * inventario real e uma sequencia de atos de PESSOAS DIFERENTES, e o valor da trilha nao esta em
 * "existe uma linha de RECONTAGEM" — esta em conseguir contar a historia de ponta a ponta pela
 * rota real, sem abrir o banco: quem abriu, quem contou o que, quem corrigiu a propria contagem,
 * quem reconferiu por cima e quem homologou o ajuste.
 *
 * Tudo por ROTA REAL, zero mock: a jornada usa `POST /conferencias`, `PUT /item/:itemId`,
 * `PUT /concluir` e le o resultado por `GET /auditoria` — a MESMA rota que a Task 2 gateou.
 *
 * Tres coisas que so este arquivo afere:
 *
 *  1. **A ordem.** `GET /auditoria` devolve DESC (`ORDER BY created_at DESC, id DESC`) — a
 *     sequencia CRONOLOGICA e o array INVERTIDO. A assercao abaixo inverte explicitamente, e e
 *     aferivel so por causa do desempate por `id DESC` que a Task 2 acrescentou (C5): `created_at`
 *     tem resolucao de SEGUNDO e os 6 atos desta jornada caem no mesmo segundo com folga — sem o
 *     desempate, a ordem dentro do empate seria indefinida e este teste seria flaky.
 *
 *  2. **Os autores por ato.** Cada linha do log tem de apontar para quem fez AQUELE ato, nao para
 *     o responsavel da conferencia. Sao tres pessoas: o almoxarife que abriu e contou, o segundo
 *     almoxarife que reconferiu e o gestor que homologou.
 *
 *  3. **Que o motor rodou de verdade.** A CONCLUSAO diz `ajustesAplicados: 2` — o teste confere o
 *     SALDO dos dois materiais e o par de `AJUSTE_INVENTARIO` no ledger. Sem isso, um log que
 *     mentisse (linha gravada, ajuste nao aplicado) passaria verde.
 *
 * A conferencia tem `dupla_contagem` OBRIGATORIAMENTE: o ramo "correcao do proprio contador"
 * (que continua sendo CONTAGEM, com o de/para) so existe com a flag.
 *
 * Executar: cd server && node tests/api/conferenciaAuditoriaJornada.api.test.js
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

// Tres atores DISTINTOS, todos `role: 'usuario'` com perfil de verdade — com `role: 'admin'`
// todo mundo vira ADMINISTRADOR (permissions.js:93) e a jornada nao provaria autoria nenhuma
// contra os gates reais.
//  - CONTADOR_A / CONTADOR_B: ALMOXARIFE tem `inventario`, NAO tem `ajustar_estoque`;
//  - HOMOLOGADOR: GESTOR tem os dois — e quem pode concluir aplicando ajuste;
//  - AUDITOR: ADMINISTRADOR e o unico que passa no `configurar` do GET /auditoria (RN-06).
const CONTADOR_A = { id: 71, nome: 'Ana Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'ana@test.com' };
const CONTADOR_B = { id: 72, nome: 'Bruno Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'bruno@test.com' };
const HOMOLOGADOR = { id: 73, nome: 'Gisele Gestora', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gisele@test.com' };
const AUDITOR = { id: 74, nome: 'Auditor Almox', role: 'usuario', perfil_almoxarifado: 'ADMINISTRADOR', email: 'auditor@test.com' };

const CATEGORIA = 'CAT-JORNADA-18';

async function novoMaterial(db, { codigo, nome, qtd, custo }) {
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
     (codigo, nome, unidade, quantidade_atual, custo_unitario, categoria, ativo)
     VALUES (?,?,'UN',?,?,?,1)`, [codigo, nome, qtd, custo, CATEGORIA]);
  return { id: r.lastID, codigo, nome };
}

async function itemDoMaterial(db, confId, materialId) {
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
    [confId, materialId]);
  assert.ok(item, 'item nao encontrado na conferencia');
  return item;
}

function parse(linha) {
  return {
    ...linha,
    dados_anteriores: linha.dados_anteriores ? JSON.parse(linha.dados_anteriores) : null,
    dados_novos: linha.dados_novos ? JSON.parse(linha.dados_novos) : null,
  };
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: CONTADOR_A });

  // Estado compartilhado pela jornada — preenchido no primeiro teste e lido pelos seguintes.
  const estado = {};

  // ── A jornada, ato por ato, so por rota real ─────────────────────────────────────────────
  await test('jornada: abrir com dupla contagem -> contar 2 -> corrigir 1 -> outro usuario reconta o outro -> concluir aplicando ajuste', async () => {
    estado.matA = await novoMaterial(db, { codigo: 'JOR-A', nome: 'Chapa A', qtd: 100, custo: 10 });
    estado.matB = await novoMaterial(db, { codigo: 'JOR-B', nome: 'Chapa B', qtd: 50, custo: 4 });

    // Ato 1 — Ana abre a conferencia (2 itens, dupla contagem).
    // tolerancia altissima de proposito: a regra de "recontagem necessaria" (RN-05 da Etapa 10)
    // e outro assunto e ja tem teste proprio; aqui ela so atrapalharia a conclusao.
    setUser(CONTADOR_A);
    const criar = await request(app).post('/api/almoxarifado/conferencias')
      .send({ categoria: CATEGORIA, dupla_contagem: true, tolerancia_percentual: 100000 });
    assert.strictEqual(criar.status, 201, JSON.stringify(criar.body));
    assert.strictEqual(criar.body.totalItens, 2, 'a jornada exige exatamente os 2 materiais no escopo');
    estado.conf = criar.body;

    const itemA = await itemDoMaterial(db, estado.conf.id, estado.matA.id);
    const itemB = await itemDoMaterial(db, estado.conf.id, estado.matB.id);
    estado.itemA = itemA;
    estado.itemB = itemB;

    // Ato 2 — Ana conta o material A (100 no sistema, 90 na prateleira).
    const contaA = await request(app).put(`/api/almoxarifado/conferencias/${estado.conf.id}/item/${itemA.id}`)
      .send({ quantidade_contada: 90 });
    assert.strictEqual(contaA.status, 200, JSON.stringify(contaA.body));
    assert.strictEqual(contaA.body.recontagem, false);

    // Ato 3 — Ana conta o material B (50 no sistema, 48 na prateleira).
    const contaB = await request(app).put(`/api/almoxarifado/conferencias/${estado.conf.id}/item/${itemB.id}`)
      .send({ quantidade_contada: 48 });
    assert.strictEqual(contaB.status, 200, JSON.stringify(contaB.body));
    assert.strictEqual(contaB.body.recontagem, false);

    // Ato 4 — Ana percebe que errou e CORRIGE o A (90 -> 95). Ninguem recontou ainda, entao ela
    // ainda pode: e o ramo `ehCorrecaoDoPrimeiro`, que continua sendo CONTAGEM (nao recontagem).
    const corrige = await request(app).put(`/api/almoxarifado/conferencias/${estado.conf.id}/item/${itemA.id}`)
      .send({ quantidade_contada: 95 });
    assert.strictEqual(corrige.status, 200, JSON.stringify(corrige.body));
    assert.strictEqual(corrige.body.recontagem, false, 'correcao do proprio contador NAO e recontagem');

    // Ato 5 — Bruno reconta o B (48 -> 46). Outra pessoa: agora e RECONTAGEM de verdade.
    setUser(CONTADOR_B);
    const reconta = await request(app).put(`/api/almoxarifado/conferencias/${estado.conf.id}/item/${itemB.id}`)
      .send({ quantidade_contada: 46 });
    assert.strictEqual(reconta.status, 200, JSON.stringify(reconta.body));
    assert.strictEqual(reconta.body.recontagem, true, 'contagem de OUTRA pessoa e recontagem');

    // Ato 6 — Gisele conclui APLICANDO ajuste (ALMOXARIFE nao poderia: nao tem ajustar_estoque).
    setUser(HOMOLOGADOR);
    const concluir = await request(app).put(`/api/almoxarifado/conferencias/${estado.conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'Contagem fisica conferida em dupla' });
    assert.strictEqual(concluir.status, 200, JSON.stringify(concluir.body));
    assert.strictEqual(concluir.body.ajustesAplicados, 2, JSON.stringify(concluir.body));
    estado.concluir = concluir.body;
  });

  // ── O log, lido pela ROTA (nao pelo banco), como ADMINISTRADOR ────────────────────────────
  await test('log: GET /auditoria como ADMINISTRADOR devolve a sequencia CRONOLOGICA (o array invertido, porque a rota ordena DESC)', async () => {
    setUser(AUDITOR);
    const res = await request(app)
      .get(`/api/almoxarifado/auditoria?entidade=conferencia&entidade_id=${estado.conf.id}`);
    assert.strictEqual(res.status, 200, `esperava 200 para ADMINISTRADOR: ${JSON.stringify(res.body).slice(0, 200)}`);
    // A rota devolve { total, limite, offset, truncado, itens } — a forma passou a declarar
    // o corte no fix-round da Fase 5 (achado A3: truncagem silenciosa engolia a CRIACAO de
    // inventarios grandes, justamente o ato mais velho).
    assert.ok(Array.isArray(res.body.itens), 'a rota devolve { itens: [...] }');
    assert.strictEqual(res.body.truncado, false, 'esta jornada e pequena: nada truncado');
    assert.strictEqual(res.body.total, res.body.itens.length, 'total bate com o que veio');

    const emDesc = res.body.itens.map(parse);
    // A rota ordena `created_at DESC, id DESC` — a MAIS NOVA vem primeiro. A historia na ordem em
    // que aconteceu e, portanto, este array INVERTIDO. O `.reverse()` esta aqui explicito de
    // proposito: e a unica traducao entre "o que a API devolve" e "a ordem dos fatos".
    const cronologica = [...emDesc].reverse();
    estado.cronologica = cronologica;

    assert.strictEqual(cronologica.length, 6,
      `a jornada tem 6 atos auditados; veio ${cronologica.length}: ${JSON.stringify(emDesc.map((l) => l.acao))}`);
    assert.deepStrictEqual(
      cronologica.map((l) => l.acao),
      ['CRIACAO', 'CONTAGEM', 'CONTAGEM', 'CONTAGEM', 'RECONTAGEM', 'CONCLUSAO'],
      `sequencia fora de ordem (DESC como veio da rota: ${JSON.stringify(emDesc.map((l) => l.acao))})`,
    );
    // Controle da traducao DESC->cronologica: o array como a rota entregou comeca pelo ato MAIS
    // NOVO. Se algum dia a rota passar a devolver ASC, esta linha cai junto com o `.reverse()`.
    assert.strictEqual(emDesc[0].acao, 'CONCLUSAO', 'a rota entrega a mais NOVA primeiro');
    assert.strictEqual(emDesc[emDesc.length - 1].acao, 'CRIACAO');
    // E os ids sobem com a cronologia (o desempate por id e o que torna a ordem aferivel).
    const ids = cronologica.map((l) => l.id);
    assert.deepStrictEqual([...ids].sort((a, b) => a - b), ids, `ids fora de ordem: ${JSON.stringify(ids)}`);
  });

  await test('log: cada ato aponta para QUEM o fez — Ana abre e conta, Bruno reconta, Gisele homologa', async () => {
    const c = estado.cronologica;
    assert.ok(c, 'depende do teste anterior');
    assert.deepStrictEqual(
      c.map((l) => l.usuario_id),
      [CONTADOR_A.id, CONTADOR_A.id, CONTADOR_A.id, CONTADOR_A.id, CONTADOR_B.id, HOMOLOGADOR.id],
      `autoria trocada: ${JSON.stringify(c.map((l) => `${l.acao}:${l.usuario_nome}`))}`,
    );
    assert.deepStrictEqual(
      c.map((l) => l.usuario_nome),
      [CONTADOR_A.nome, CONTADOR_A.nome, CONTADOR_A.nome, CONTADOR_A.nome, CONTADOR_B.nome, HOMOLOGADOR.nome],
    );
    // A conferencia inteira carrega o mesmo numero em todas as 6 linhas — e o que permite ler a
    // historia sem um segundo JOIN.
    const numeros = c.map((l) => l.dados_novos.numero || l.dados_novos.conferencia_numero);
    assert.deepStrictEqual(numeros, Array(6).fill(estado.conf.numero), JSON.stringify(numeros));
    assert.deepStrictEqual(c.map((l) => l.entidade_id), Array(6).fill(estado.conf.id));
  });

  await test('log: a historia contada linha a linha — abertura, as 2 contagens, a correcao com de/para, a recontagem e a homologacao', async () => {
    const [criacao, contA, contB, correcao, recontagem, conclusao] = estado.cronologica;
    assert.ok(criacao, 'depende do teste da sequencia');

    // 1. Abertura.
    assert.strictEqual(criacao.dados_novos.total_itens, 2);
    assert.strictEqual(criacao.dados_novos.dupla_contagem, 1, 'a jornada exige dupla contagem');
    assert.strictEqual(criacao.dados_novos.escopo_descricao, `Categoria: ${CATEGORIA}`);

    // 2. Primeira contagem do A: sem de/para (nao havia valor anterior para evaporar).
    assert.strictEqual(contA.dados_novos.material_codigo, estado.matA.codigo);
    assert.strictEqual(contA.dados_anteriores, null, 'primeira contagem nao tem de/para');
    assert.strictEqual(contA.dados_novos.quantidade_sistema, 100);
    assert.strictEqual(contA.dados_novos.quantidade_contada, 90);
    assert.strictEqual(contA.dados_novos.divergencia, -10);

    // 3. Primeira contagem do B.
    assert.strictEqual(contB.dados_novos.material_codigo, estado.matB.codigo);
    assert.strictEqual(contB.dados_anteriores, null);
    assert.strictEqual(contB.dados_novos.quantidade_contada, 48);
    assert.strictEqual(contB.dados_novos.divergencia, -2);

    // 4. A CORRECAO do A: continua CONTAGEM (o ramo do proprio contador) e e a UNICA memoria do
    // 90 que o UPDATE sobrescreveu — o item so guarda o valor final.
    assert.strictEqual(correcao.dados_novos.material_codigo, estado.matA.codigo,
      'a correcao e do material A, nao do B');
    assert.ok(correcao.dados_anteriores, 'RN-04: a correcao TEM de guardar o de/para');
    assert.strictEqual(correcao.dados_anteriores.quantidade_contada, 90);
    assert.strictEqual(correcao.dados_anteriores.contado_por_nome, CONTADOR_A.nome);
    assert.strictEqual(correcao.dados_novos.quantidade_contada, 95);
    assert.strictEqual(correcao.dados_novos.divergencia, -5);
    assert.ok(!('recontado_por_nome' in correcao.dados_novos),
      'correcao do proprio contador nao preenche recontado_por');

    // 5. A RECONTAGEM do B, por Bruno, com o de/para apontando para Ana.
    assert.strictEqual(recontagem.dados_novos.material_codigo, estado.matB.codigo);
    assert.strictEqual(recontagem.dados_anteriores.quantidade_contada, 48);
    assert.strictEqual(recontagem.dados_anteriores.contado_por_nome, CONTADOR_A.nome,
      'o de/para da recontagem nomeia o PRIMEIRO contador');
    assert.strictEqual(recontagem.dados_novos.quantidade_contada, 46);
    assert.strictEqual(recontagem.dados_novos.divergencia, -4);
    assert.strictEqual(recontagem.dados_novos.recontado_por_nome, CONTADOR_B.nome);

    // 6. A homologacao: os numeros do log tem de bater com a resposta da propria rota.
    assert.strictEqual(conclusao.dados_novos.aplicar_ajustes, true);
    assert.strictEqual(conclusao.dados_novos.ajustesAplicados, 2);
    assert.strictEqual(conclusao.dados_novos.itens_contados, 2);
    assert.strictEqual(conclusao.dados_novos.itens_divergentes, 2);
    // |−5| * 10 (A) + |−4| * 4 (B) = 66 — o mesmo numero que a rota devolveu.
    assert.strictEqual(conclusao.dados_novos.impactoFinanceiro, 66);
    assert.strictEqual(conclusao.dados_novos.impactoFinanceiro, estado.concluir.impactoFinanceiro,
      'o log tem de repetir o impacto que a rota respondeu');
    assert.strictEqual(conclusao.justificativa, 'Contagem fisica conferida em dupla');
  });

  // ── O motor rodou de verdade (o log nao esta contando uma historia que nao aconteceu) ─────
  await test('motor: o saldo dos dois materiais bate com o ajuste homologado, com um AJUSTE_INVENTARIO por item no ledger', async () => {
    const matA = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [estado.matA.id]);
    const matB = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [estado.matB.id]);
    // O saldo final e o valor CORRIGIDO/RECONTADO, nao a primeira contagem: 95 (nao 90) e 46
    // (nao 48). Se o ajuste tivesse usado o primeiro valor, o log estaria certo e o estoque
    // errado — e so esta assercao pegaria.
    assert.strictEqual(Number(matA.quantidade_atual), 95,
      `material A deveria ter ficado com 95 (valor corrigido), veio ${matA.quantidade_atual}`);
    assert.strictEqual(Number(matB.quantidade_atual), 46,
      `material B deveria ter ficado com 46 (valor recontado), veio ${matB.quantidade_atual}`);

    const movs = await dbAll(db,
      `SELECT material_id, tipo, quantidade, saldo_anterior, saldo_posterior, usuario_id
       FROM movimentacoes_almoxarifado WHERE referencia = ? ORDER BY id`, [estado.conf.numero]);
    assert.strictEqual(movs.length, 2, `esperava 2 movimentacoes do inventario, veio ${movs.length}`);
    assert.ok(movs.every((m) => m.tipo === 'AJUSTE_INVENTARIO'),
      `o ajuste do inventario passa pelo motor como AJUSTE_INVENTARIO: ${JSON.stringify(movs.map((m) => m.tipo))}`);
    // Quem homologou e quem assina a movimentacao — nao o contador.
    assert.ok(movs.every((m) => m.usuario_id === HOMOLOGADOR.id),
      'a movimentacao do ajuste e do homologador');
    const porMaterial = new Map(movs.map((m) => [m.material_id, m]));
    assert.strictEqual(Number(porMaterial.get(estado.matA.id).saldo_anterior), 100);
    assert.strictEqual(Number(porMaterial.get(estado.matA.id).saldo_posterior), 95);
    assert.strictEqual(Number(porMaterial.get(estado.matB.id).saldo_anterior), 50);
    assert.strictEqual(Number(porMaterial.get(estado.matB.id).saldo_posterior), 46);

    // E a conferencia fechou com o homologador registrado (RN-05, Task 2) — a ponta que liga o
    // log ao registro da propria conferencia.
    const conf = await dbGet(db, `SELECT status, aprovador_id, aprovador_nome
                                  FROM conferencias_almoxarifado WHERE id = ?`, [estado.conf.id]);
    assert.strictEqual(conf.status, 'CONCLUIDO');
    assert.strictEqual(conf.aprovador_id, HOMOLOGADOR.id);
    assert.strictEqual(conf.aprovador_nome, HOMOLOGADOR.nome);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})();
