/**
 * Etapa 46, T5 — INTEGRAÇÃO: o beco inteiro, pela porta HTTP, cruzando os dois galhos.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa46-nc-destravada.md (T5)
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa46-nc-destravada-design.md
 *
 * ── POR QUE ESTE ARQUIVO EXISTE, E POR QUE NENHUM OUTRO O SUBSTITUI ─────────────────────────
 * A T2 prova o cancelamento. A T3 prova que o cartao novo cobra a execucao pendente. NENHUMA DAS
 * DUAS prova que cancelar CALA o cartao — e essa e a composicao que o usuario ve. O padrao desta
 * base e explicito sobre isso: na Etapa 25 foram 12 cenarios de unidade VERDES e 4 de integracao
 * VERMELHOS, com a feature morta.
 *
 * E aqui ha um segundo motivo, mais forte: o fluxo deste arquivo e o CENARIO REAL DO FURO C64.
 * Material com numero de serie, decidido `DEVOLVER`, e um documento que a Etapa 45 tornou
 * IMPOSSIVEL de executar (400 fatal, para sempre) e que nada tirava da fila. Se o cancelamento
 * so funcionasse em NC sem serie, a etapa inteira teria passado ao lado do problema que a
 * originou. Este arquivo mede exatamente esse documento.
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) o beco ponta a ponta: recusa 400 -> na fila -> no cartao -> cancelar -> fora dos dois
 *   (2) o saldo NAO se move em NENHUM dos passos (nem na decisao, nem na recusa, nem no cancel)
 *   (3) o gate pela ROTA: COMPRAS toma 403 ao cancelar, e o documento continua DECIDIDA
 *   (4) a decisao continua LEGIVEL pela rota de leitura depois do cancelamento
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * O (1) afirma presenca ANTES de afirmar ausencia — sem a metade positiva, "saiu do cartao"
 * passaria com um cartao que nunca listou nada. E o (2) compara valores EXATOS, medidos antes e
 * depois de cada passo, nunca "nao mudou".
 *
 * Executar: cd server && node tests/api/ncBecoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const nc = require('../../services/almoxarifado/nonConformityService');
const { ALERT_REGISTRY } = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 470, nome: 'Admin E46T5', role: 'admin', is_superadmin: 1, email: 'a46t5@test.com' };
const QUALIDADE = { id: 471, nome: 'Fulana Qualidade', perfil_almoxarifado: 'QUALIDADE', email: 'q46t5@test.com' };
const COMPRAS = { id: 472, nome: 'Beltrano Compras', perfil_almoxarifado: 'COMPRAS', email: 'c46t5@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;
const ROTA = '/api/almoxarifado/nao-conformidades';

(async () => {
  console.log('\n=== Etapa 46 T5: o beco inteiro, pela rota, cruzando os galhos ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  const saldos = (id) => dbGet(db, `SELECT quantidade_atual, quantidade_bloqueada
    FROM materiais_almoxarifado WHERE id = ?`, [id]);

  /** Material com CONTROLE DE SERIE reprovado na inspecao — o documento que a 45 tranca. */
  async function pecaSerializadaReprovada({ reprovada = 3, esperada = 10 } = {}) {
    const mat = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo, controle_serie)
      VALUES (?,?,?,?,?,1,1)`,
      [uniq('MAT-E46T5'), 'Eixo serializado', 'PC', esperada, reprovada]);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-E46T5'), 'RECEBIDO', uniq('NF')]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, esperada]);
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_id, responsavel_nome)
      VALUES (?,?,?,?,?,?)`,
      [item.lastID, 0, esperada - reprovada, reprovada, QUALIDADE.id, QUALIDADE.nome]);
    return { materialId: mat.lastID, inspecaoId: insp.lastID };
  }

  /** A entrada nova do registro (T3), pelo `listar` dela — e nao por SQL copiado aqui. */
  const entradaExecucaoPendente = ALERT_REGISTRY.find((e) => e.chave === 'NAO_CONFORMIDADE_EXECUCAO_PENDENTE');

  /** Cobra o cartao com janela ZERO: o `> ?` do SQL exige diferenca positiva, e a NC acabou de ser
   * decidida. Sem isso o cenario mediria a JANELA, nao a regua — e passaria verde de graca. */
  const noCartao = async (ncId) => {
    const linhas = await entradaExecucaoPendente.listar(db, { dias: -1 });
    return linhas.some((l) => l.id === ncId);
  };

  const naFila = async (ncId) => {
    const linhas = await nc.listarNaoConformidades(db, { execucao: 'PENDENTE' });
    return linhas.some((l) => l.id === ncId);
  };

  await test('(0) a entrada nova do registro EXISTE e e a 15a — sem ela o resto nao mede nada', async () => {
    assert.ok(entradaExecucaoPendente, 'NAO_CONFORMIDADE_EXECUCAO_PENDENTE nao esta no registro');
    assert.strictEqual(typeof entradaExecucaoPendente.listar, 'function');
    assert.strictEqual(ALERT_REGISTRY.length, 15, `o registro tem ${ALERT_REGISTRY.length} entradas`);
  });

  await test('(1) o beco inteiro: 400 fatal -> na fila E no cartao -> cancelar -> fora dos DOIS', async () => {
    const { materialId, inspecaoId } = await pecaSerializadaReprovada({ reprovada: 3, esperada: 10 });

    setUser(QUALIDADE);
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    const dec = await request(app).post(`${ROTA}/${doc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'eixo fora de especificacao dimensional' });
    assert.strictEqual(dec.status, 200, `decidir deu ${dec.status}: ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.execucao_estado, 'PENDENTE');

    // A recusa da Etapa 45 — FATAL, e e ela que cria o beco.
    setUser(COMPRAS);
    const exec = await request(app).post(`${ROTA}/${doc.id}/executar`).send({ observacoes: 'coleta 51' });
    assert.strictEqual(exec.status, 400, `executar deu ${exec.status}: ${JSON.stringify(exec.body)}`);
    assert.strictEqual(exec.body.error,
      'Material com controle de série não pode ser devolvido por aqui — dê baixa pela tela de Movimentações');

    // METADE POSITIVA, e ela vem ANTES: o documento preso esta nas DUAS superficies.
    assert.strictEqual(await naFila(doc.id), true, 'o documento preso nao apareceu na fila de execucao');
    assert.strictEqual(await noCartao(doc.id), true,
      'o documento preso nao apareceu no cartao novo — e era ele que nao cobrava ninguem antes desta etapa');

    // E repetir a execucao continua 400: o beco nao se abre pela insistencia.
    const exec2 = await request(app).post(`${ROTA}/${doc.id}/executar`).send({});
    assert.strictEqual(exec2.status, 400, 'a segunda tentativa mudou de resposta');

    // A SAIDA.
    setUser(QUALIDADE);
    const canc = await request(app).post(`${ROTA}/${doc.id}/cancelar`)
      .send({ motivo: 'baixa das 3 pecas dada em Movimentacoes, series 4471 a 4473' });
    assert.strictEqual(canc.status, 200, `cancelar deu ${canc.status}: ${JSON.stringify(canc.body)}`);
    assert.strictEqual(canc.body.status, 'CANCELADA');
    assert.strictEqual(canc.body.cancelamento.mensagem,
      'Documento cancelado — a decisão fica registrada, e a execução deixa de ser cobrada');

    assert.strictEqual(await naFila(doc.id), false, 'a cancelada continua na fila do Compras');
    assert.strictEqual(await noCartao(doc.id), false,
      'a cancelada continua no cartao — cancelar nao calou a cobranca, e e esta a composicao que so este arquivo mede');

    // O saldo: intocado do inicio ao fim. Valores EXATOS.
    const s = await saldos(materialId);
    assert.strictEqual(s.quantidade_atual, 10, `fisico virou ${s.quantidade_atual}`);
    assert.strictEqual(s.quantidade_bloqueada, 3, `bloqueado virou ${s.quantidade_bloqueada}`);
  });

  await test('(2) o gate pela ROTA: COMPRAS toma 403 e o documento continua DECIDIDA', async () => {
    const { inspecaoId } = await pecaSerializadaReprovada({ reprovada: 2, esperada: 8 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    setUser(QUALIDADE);
    await request(app).post(`${ROTA}/${doc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'reprovado no dimensional' });

    // COMPRAS executa (B176) e NAO anula. Este 403 e a linha que distingue os dois gates — sem
    // ele, a rota poderia estar pendurada em `executar_encaminhamento` e ninguem notaria, porque
    // ADMINISTRADOR e QUALIDADE estao nos dois.
    setUser(COMPRAS);
    const res = await request(app).post(`${ROTA}/${doc.id}/cancelar`).send({ motivo: 'quero limpar minha fila' });
    assert.strictEqual(res.status, 403, `COMPRAS cancelou: ${res.status} ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.acao, 'cancelar_nao_conformidade',
      'o 403 nao nomeia a acao — a tela nao consegue traduzir o erro');
    assert.strictEqual(res.body.perfil, 'COMPRAS');

    // O 403 vem ANTES de qualquer efeito.
    const linha = await dbGet(db, 'SELECT status, cancelado_por_id FROM nao_conformidades_almoxarifado WHERE id = ?', [doc.id]);
    assert.strictEqual(linha.status, 'DECIDIDA', 'o 403 nao impediu a gravacao');
    assert.strictEqual(linha.cancelado_por_id, null);

    // E a metade positiva, no mesmo cenario: COMPRAS CONTINUA podendo executar (e tomando o 400
    // da serie, que e outra coisa). Sem esta linha o cenario passaria com um COMPRAS sem nada.
    const exec = await request(app).post(`${ROTA}/${doc.id}/executar`).send({});
    assert.strictEqual(exec.status, 400, `COMPRAS perdeu a execucao: ${exec.status}`);
  });

  await test('(3) depois de cancelada, a decisao continua LEGIVEL pela rota de leitura', async () => {
    const { inspecaoId } = await pecaSerializadaReprovada({ reprovada: 1, esperada: 5 });
    const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    setUser(QUALIDADE);
    await request(app).post(`${ROTA}/${doc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'trinca visivel na sede do rolamento' });
    await request(app).post(`${ROTA}/${doc.id}/cancelar`).send({ motivo: 'peca sucateada no lugar da devolucao' });

    const res = await request(app).get(`${ROTA}/${doc.id}`);
    assert.strictEqual(res.status, 200);
    const b = res.body;
    assert.strictEqual(b.status, 'CANCELADA');
    // O QUE A ETAPA PROMETE: a decisao nao virou pergunta sem resposta.
    assert.strictEqual(b.decisao, 'DEVOLVER', 'a decisao sumiu da leitura — o cancelamento apagou evidencia');
    assert.strictEqual(b.justificativa, 'trinca visivel na sede do rolamento');
    assert.strictEqual(b.decidido_por_nome, QUALIDADE.nome);
    assert.ok(b.decidido_em, 'decidido_em sumiu');
    // E o rastro do cancelamento, que a projecao passou a carregar nesta etapa.
    assert.strictEqual(b.cancelado_por_nome, QUALIDADE.nome,
      'a projecao nao devolve quem cancelou — a tela nunca podera mostrar');
    assert.strictEqual(b.motivo_cancelamento, 'peca sucateada no lugar da devolucao');
  });

  await test('(4) o cartao novo NAO confunde os estados: executada e cancelada ficam fora, pendente fica', async () => {
    // Tres documentos, tres destinos. Sem os tres no mesmo cenario, "fica fora" nao distingue
    // "a regua funciona" de "o cartao esta vazio".
    const feitos = [];
    for (const destino of ['pendente', 'cancelada']) {
      const { inspecaoId } = await pecaSerializadaReprovada({ reprovada: 1, esperada: 4 });
      const doc = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
      setUser(QUALIDADE);
      await request(app).post(`${ROTA}/${doc.id}/decidir`)
        .send({ decisao: 'ANALISE_ENGENHARIA', justificativa: 'avaliar reaproveitamento' });
      if (destino === 'cancelada') {
        await request(app).post(`${ROTA}/${doc.id}/cancelar`).send({ motivo: 'engenharia dispensou a analise' });
      }
      feitos.push({ destino, id: doc.id });
    }
    // E uma EXECUTADA: `ANALISE_ENGENHARIA` nao mexe em saldo, entao a execucao passa.
    const { inspecaoId } = await pecaSerializadaReprovada({ reprovada: 1, esperada: 4 });
    const executada = await nc.abrirNaoConformidadeDeInspecao(db, QUALIDADE, inspecaoId);
    setUser(QUALIDADE);
    await request(app).post(`${ROTA}/${executada.id}/decidir`)
      .send({ decisao: 'ANALISE_ENGENHARIA', justificativa: 'avaliar reaproveitamento' });
    setUser(COMPRAS);
    const ex = await request(app).post(`${ROTA}/${executada.id}/executar`).send({ observacoes: 'laudo 12 anexado' });
    assert.strictEqual(ex.status, 200, `a execucao de ANALISE_ENGENHARIA deu ${ex.status}: ${JSON.stringify(ex.body)}`);

    const pendente = feitos.find((f) => f.destino === 'pendente').id;
    const cancelada = feitos.find((f) => f.destino === 'cancelada').id;
    assert.strictEqual(await noCartao(pendente), true, 'a pendente nao esta no cartao — o cartao esta vazio');
    assert.strictEqual(await noCartao(cancelada), false, 'a cancelada continua no cartao');
    assert.strictEqual(await noCartao(executada.id), false, 'a executada continua no cartao');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
