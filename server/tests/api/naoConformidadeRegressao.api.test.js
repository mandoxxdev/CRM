/**
 * Etapa 43 — REGRESSAO dos seis consertos da revisao adversarial da nao conformidade numerada.
 *
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md
 * Servico: server/services/almoxarifado/nonConformityService.js (cada conserto tem docblock la)
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────────────────────
 * Os seis consertos entraram na arvore e a suite inteira (204 arquivos) continuou VERDE. Isso nao
 * e uma boa noticia: quer dizer que nenhum cenario existente sabia distinguir o codigo consertado
 * do codigo defeituoso. Um conserto que nenhum teste prende volta na proxima refatoracao, e o
 * proximo leitor nao tem como saber que aquilo era intencional. Cada cenario daqui foi escrito
 * para ficar VERMELHO quando o conserto correspondente e desfeito — e cada um teve a sabotagem
 * rodada de verdade (os resultados estao no relatorio da task).
 *
 * ── O QUE CADA CENARIO PRENDE ────────────────────────────────────────────────────────────────
 *   (1) CRITICAL — O SILENCIO COMPLETO. Decidir, corrigir, quebrar DE NOVO no mesmo valor:
 *       sem o carimbo `fato_superado_em`, a RN-10 achava "mesmo fato" e NAO abria documento, e o
 *       cartao antigo ja tinha excluido o item por ele TER documento. Falta viva, zero aviso.
 *   (2) CRITICAL — RN-11 pelo caminho `aprovar`. Ha DOIS caminhos que creditam estoque e so um
 *       deixa o recebimento em `PROCESSADO`. Pelo outro, a NC de uma falta que ja virou estoque
 *       era CANCELADA, com motivo automatico afirmando uma correcao que nunca houve.
 *   (3) O par origem x referencia. Validados separadamente, a combinacao cruzada passava por
 *       baixo do indice unico parcial e abria uma SEGUNDA NC ABERTA do mesmo item e tipo.
 *   (4) Escopo do gancho. Conferir o recebimento A citando item do recebimento B abria documento
 *       para o item de B e, quando ele nao estava divergente, DESTRUIA a NC de B.
 *   (5) NC manual nao e apagada pelo gancho. A RN-05 so vale para documento que o GANCHO abriu.
 *   (6) O `fato` nao e forjavel pela porta HTTP — nem `aberto_automaticamente`.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * Todo cenario que afirma AUSENCIA ("nao nasceu", "nao cancelou") tem irmao POSITIVO no mesmo
 * cenario, porque uma ausencia passa identica com a rota morta, com o fixture errado ou com a
 * tabela vazia por outro motivo — ja aconteceu tres vezes nesta base:
 *   - (2) afirma que a aprovacao CREDITOU o estoque antes de afirmar que a NC sobreviveu;
 *   - (3) afirma que os DOIS pares validos abrem (201) ao lado dos cruzados que recusam (400);
 *   - (4) afirma que o item do PROPRIO recebimento ganhou NC antes de afirmar que o do outro nao;
 *   - (5) afirma que a NC AUTOMATICA no mesmo estado E cancelada, ao lado da manual que sobrevive;
 *   - (6) afirma que o documento saiu com o fato REAL, e nao apenas que o forjado nao entrou.
 *
 * Executar: cd server && node tests/api/naoConformidadeRegressao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const BASE = '/api/almoxarifado/nao-conformidades';

const ADMIN = { id: 4300, nome: 'Admin E43 Regressao', role: 'admin', is_superadmin: 1, email: 'admin43r@test.com' };
const QUALIDADE = { id: 4301, nome: 'Qualidade E43 Regressao', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'qual43r@test.com' };

let seq = 0;

(async () => {
  console.log('\n=== Etapa 43: regressao dos consertos da revisao adversarial ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  async function novoMaterial() {
    seq += 1;
    const codigo = `NCR-${String(seq).padStart(4, '0')}`;
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
      [codigo, `Material regressao NC ${seq}`]);
    return { id: r.lastID, codigo };
  }

  /**
   * Recebimento REAL pelo servico de producao. Os itens nascem com
   * `quantidade_recebida = quantidade_esperada` (receiptService.js:425), ou seja SEM divergencia —
   * quem fabrica a falta e cada cenario, pelo caminho que ele quer medir.
   */
  async function novoRecebimento(quantidades = [10]) {
    const materiais = [];
    for (let i = 0; i < quantidades.length; i += 1) materiais.push(await novoMaterial());
    seq += 1;
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      nota_fiscal: `NF-NCR-${seq}`,
      itens: quantidades.map((q, i) => ({ material_id: materiais[i].id, quantidade: q })),
    });
    const itens = await dbAll(db,
      'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id',
      [rec.id]);
    return { recId: rec.id, itemIds: itens.map((i) => i.id), itemId: itens[0].id, materiais };
  }

  const conferir = (recId, itens) => request(app)
    .put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens });

  /** Escreve a quantidade DIRETO na coluna, sem passar por rota: fabrica estado sem gancho. */
  const setQtd = (itemId, q) => dbRun(db,
    'UPDATE recebimentos_material_itens_almoxarifado SET quantidade_recebida = ? WHERE id = ?',
    [q, itemId]);

  const ncsDoItem = (itemId) => dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
    WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? ORDER BY id`, [itemId]);

  const itemGravado = (itemId) => dbGet(db,
    'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);

  const recebimentoGravado = (recId) => dbGet(db,
    'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recId]);

  const ncGravada = (id) => dbGet(db, 'SELECT * FROM nao_conformidades_almoxarifado WHERE id = ?', [id]);

  /** Decide a NC PELA PORTA HTTP, com o perfil QUALIDADE — o unico que o D8 deixa decidir. */
  async function decidirPorHttp(ncId, decisao, justificativa) {
    setUser({ ...QUALIDADE });
    const r = await request(app).post(`${BASE}/${ncId}/decidir`).send({ decisao, justificativa });
    setUser({ ...ADMIN });
    return r;
  }

  // ── (1) CRITICAL: o silencio completo ──────────────────────────────────────────────────────
  //
  // A sequencia e a da revisao, sem atalho: 8 de 10 (documento), decisao de uma PESSOA, correcao
  // para 10, e a MESMA falta de novo. Antes do conserto o item terminava fora dos DOIS cartoes —
  // o novo nao o via (nenhuma NC ABERTA) e o antigo o tinha excluido por ele ter documento.
  await test('(1) [CRITICAL] decidir, corrigir e quebrar DE NOVO no mesmo valor abre documento NOVO', async () => {
    const { recId, itemId, materiais } = await novoRecebimento([10]);

    const c1 = await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    assert.strictEqual(c1.status, 200, `a conferencia de 8 falhou: ${JSON.stringify(c1.body)}`);
    const [primeira] = await ncsDoItem(itemId);
    assert.ok(primeira, 'setup: conferir 8 de 10 tinha de abrir a primeira NC');
    assert.strictEqual(primeira.status, 'ABERTA', `a primeira NC nasceu ${primeira.status}`);

    const dec = await decidirPorHttp(primeira.id, 'ACEITAR_SOB_DESVIO', 'Falta de 2 aceita pela engenharia');
    assert.strictEqual(dec.status, 200, `a decisao por HTTP falhou: ${dec.status} ${JSON.stringify(dec.body)}`);
    assert.strictEqual(dec.body.status, 'DECIDIDA', `a NC ficou ${dec.body.status} apos a decisao`);

    // O operador corrige o proprio erro: o item volta ao normal. NENHUM documento novo aqui — o
    // que muda e invisivel na tela e e exatamente o conserto: o fato do documento encerrado passa
    // a estar SUPERADO.
    const c2 = await conferir(recId, [{ id: itemId, quantidade_recebida: 10 }]);
    assert.strictEqual(c2.status, 200, `a correcao para 10 falhou: ${JSON.stringify(c2.body)}`);
    assert.strictEqual((await ncsDoItem(itemId)).length, 1, 'corrigir para 10 nao podia criar documento');

    // E a falta volta, IGUALZINHA. Antes do conserto: `getUltimaEncerrada` achava a NC DECIDIDA,
    // `mesmoFato(-2, -2)` dava verdadeiro e o servico devolvia NENHUMA — falta real, zero NC
    // ABERTA, item fora do cartao antigo (que exclui quem tem NC nao-cancelada) e e-mail engolido
    // pelo dedupe. Silencio completo.
    const c3 = await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    assert.strictEqual(c3.status, 200, `a reconferencia de 8 falhou: ${JSON.stringify(c3.body)}`);

    const ncs = await ncsDoItem(itemId);
    assert.strictEqual(ncs.length, 2,
      'a falta voltou DEPOIS de o documento ter sido decidido e o item ter passado por um estado '
      + `sem divergencia: tinha de nascer documento NOVO, ha ${ncs.length} no item`);
    const nova = ncs[1];
    assert.strictEqual(nova.status, 'ABERTA', `o documento novo nasceu ${nova.status} em vez de ABERTA`);
    assert.strictEqual(nova.divergencia, -2, `o documento novo congelou ${nova.divergencia}`);
    assert.notStrictEqual(nova.id, primeira.id, 'a "nova" NC e a antiga reaproveitada — a decidida foi reaberta');
    assert.strictEqual(ncs[0].status, 'DECIDIDA', `a NC decidida virou ${ncs[0].status} — documento encerrado foi tocado`);

    // A METADE QUE DA SENTIDO AO CENARIO: nao basta "nasceu uma linha", o item tem de estar
    // VISIVEL. Antes do conserto ele nao aparecia em lugar NENHUM, e e isso que o tornava o pior
    // modo de falha desta etapa.
    const lista = await request(app).get(`${BASE}?status=ABERTA&limite=500`);
    assert.strictEqual(lista.status, 200, `a listagem devolveu ${lista.status}`);
    const linha = lista.body.itens.find((i) => i.id === nova.id);
    assert.ok(linha, `a NC ${nova.numero} nao aparece em ?status=ABERTA — o item ficou invisivel `
      + `nos dois cartoes (vieram ${JSON.stringify(lista.body.itens.map((i) => i.numero))})`);
    assert.strictEqual(linha.material_codigo, materiais[0].codigo,
      `a linha visivel nao identifica o material: ${JSON.stringify(linha.material_codigo)}`);

    // O carimbo do conserto, conferido DEPOIS da assercao de comportamento de proposito: se ele
    // viesse antes, a sabotagem cairia aqui e provaria menos do que o cenario sabe provar.
    const decidida = await ncGravada(primeira.id);
    assert.ok(decidida.fato_superado_em,
      'a NC decidida tinha de ficar com `fato_superado_em` carimbado quando o item voltou ao normal');
  });

  // ── (2) CRITICAL: RN-11 pelo caminho `aprovar` ─────────────────────────────────────────────
  //
  // `aprovarRecebimento`, no ramo SEM nota fiscal, credita estoque e deixa o documento em
  // `APROVADO`. A guarda da RN-11 olhava so `PROCESSADO`, entao por este caminho — que e o do
  // recebimento de pedido de compra aprovado direto — a NC de uma falta que JA virou estoque era
  // CANCELADA por uma reconferencia posterior. O marcador certo e o do ITEM (`entrada_estoque_em`),
  // escrito pelo claim de `darEntradaEstoque` nos DOIS caminhos.
  await test('(2) [CRITICAL] aprovado pelo ramo SEM nota fiscal (status APROVADO) tambem blinda a NC', async () => {
    const { recId, itemId } = await novoRecebimento([10]);

    const c1 = await conferir(recId, [{ id: itemId, quantidade_recebida: 8 }]);
    assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
    const [aberta] = await ncsDoItem(itemId);
    assert.ok(aberta && aberta.status === 'ABERTA', 'setup: a NC da falta de 2 tinha de estar ABERTA');

    const aprov = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/aprovar`).send({});
    assert.strictEqual(aprov.status, 200, `a aprovacao falhou: ${aprov.status} ${JSON.stringify(aprov.body)}`);

    // A METADE POSITIVA, e ela e o que torna o cenario diferente do (7) da suite do servico: este
    // caminho NAO deixa o recebimento em PROCESSADO, e o estoque foi creditado do mesmo jeito.
    const rec = await recebimentoGravado(recId);
    assert.strictEqual(rec.status, 'APROVADO',
      `o ramo sem nota fiscal tinha de deixar o recebimento APROVADO, veio ${rec.status} — se este `
      + 'ramo passou a terminar em PROCESSADO, o cenario deixou de medir o segundo caminho');
    assert.notStrictEqual(rec.status, receiptService.STATUS.PROCESSADO,
      'o cenario so prova alguma coisa se o status NAO for o que a guarda antiga olhava');
    const itemAposEntrada = await itemGravado(itemId);
    assert.ok(itemAposEntrada.entrada_estoque_em,
      'o estoque nao foi creditado (sem `entrada_estoque_em` no item) — nada aqui esta blindado ainda');

    // A reconferencia posterior "corrige" para 10. Destruir o documento seria irreversivel, e o
    // motivo automatico afirmaria uma correcao que nunca houve: os 8 ja viraram saldo.
    const c2 = await conferir(recId, [{ id: itemId, quantidade_recebida: 10 }]);
    assert.strictEqual(c2.status, 200, JSON.stringify(c2.body));

    const depois = await ncGravada(aberta.id);
    assert.strictEqual(depois.status, 'ABERTA',
      `a NC ${aberta.numero} de uma falta que JA virou estoque foi ${depois.status} por uma `
      + 'reconferencia — a guarda da RN-11 so conhece o caminho do PROCESSADO');
    assert.strictEqual(depois.motivo_cancelamento, null,
      `a NC ganhou motivo de cancelamento: ${JSON.stringify(depois.motivo_cancelamento)}`);
    assert.strictEqual(depois.quantidade_recebida, 8,
      `o fato congelado foi reescrito depois da entrada no estoque: ${depois.quantidade_recebida}`);
  });

  // ── (3) O par origem x referencia ──────────────────────────────────────────────────────────
  await test('(3) `origem` e `referencia_tipo` sao validados como PAR, nao separadamente', async () => {
    const { itemId } = await novoRecebimento([10]);
    setUser({ ...ADMIN });

    // A inspecao existe de verdade: o 400 tem de vir do PAR, e nao de a referencia nao existir.
    const insp = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada, responsavel_nome)
      VALUES (?,0,6,4,?)`, [itemId, 'Inspetor regressao']);

    const cruzados = [
      ['INSPECAO + RECEBIMENTO_ITEM', { origem: 'INSPECAO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemId }],
      ['RECEBIMENTO + INSPECAO', { origem: 'RECEBIMENTO', referencia_tipo: 'INSPECAO', referencia_id: insp.lastID }],
    ];
    for (const [nome, par] of cruzados) {
      const r = await request(app).post(BASE).send({ ...par, tipo: 'QUANTIDADE', descricao: `cruzado ${nome}` });
      assert.strictEqual(r.status, 400,
        `o par cruzado ${nome} devolveu ${r.status} ${JSON.stringify(r.body)} — ele passa por baixo `
        + 'do indice unico parcial e abre uma SEGUNDA NC ABERTA do mesmo item e tipo');
      assert.strictEqual(r.body.error, 'Tipo de referência inválido',
        `o par cruzado ${nome} respondeu "${r.body.error}"`);
    }

    // Nada foi gravado pelos dois 400. `referencia_tipo` entra na contagem porque `referencia_id`
    // sozinho nao distingue item de inspecao — o item 1 e a inspecao 1 convivem no mesmo banco, e
    // uma contagem so por id somaria documentos de outro cenario deste arquivo.
    const gravadas = await dbGet(db, `SELECT COUNT(*) AS n FROM nao_conformidades_almoxarifado
      WHERE (referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?)
         OR (referencia_tipo = 'INSPECAO' AND referencia_id = ?)`, [itemId, insp.lastID]);
    assert.strictEqual(gravadas.n, 0, `os pares cruzados deixaram ${gravadas.n} documento gravado`);

    // A METADE POSITIVA: os DOIS pares validos continuam abrindo. Sem ela, a guarda do par
    // passaria identica com a rota recusando TUDO.
    const validos = [
      ['RECEBIMENTO + RECEBIMENTO_ITEM', { origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemId }],
      ['INSPECAO + INSPECAO', { origem: 'INSPECAO', referencia_tipo: 'INSPECAO', referencia_id: insp.lastID }],
    ];
    for (const [nome, par] of validos) {
      const r = await request(app).post(BASE).send({ ...par, tipo: 'QUANTIDADE', descricao: `valido ${nome}` });
      assert.strictEqual(r.status, 201,
        `o par VALIDO ${nome} devolveu ${r.status} ${JSON.stringify(r.body)} — a guarda do par ficou larga demais`);
      assert.strictEqual(r.body.origem, par.origem);
      assert.strictEqual(r.body.referencia_tipo, par.referencia_tipo);
    }
  });

  // ── (4) Escopo do gancho ───────────────────────────────────────────────────────────────────
  //
  // O `UPDATE` do item e protegido por `WHERE id = ? AND recebimento_id = ?` desde sempre; o
  // gancho recebia a lista crua e buscava so por id. Conferir A citando item de B abria documento
  // com autor, hora e ato ERRADOS — e, no item sem divergencia, DESTRUIA a NC de B.
  await test('(4) conferir o recebimento A citando item de B nao muda, nao abre e NAO CANCELA nada de B', async () => {
    const a = await novoRecebimento([10]);
    const b = await novoRecebimento([10, 10]);
    const [b1, b2] = b.itemIds;

    // B1: divergente na COLUNA, sem NC (estado que nenhum gancho viu ainda).
    await setQtd(b1, 4);
    assert.strictEqual((await ncsDoItem(b1)).length, 0, 'setup: B1 tinha de estar divergente e SEM documento');

    // B2: NC AUTOMATICA aberta pelo gancho do proprio recebimento B e, depois, item corrigido na
    // coluna — fica ABERTA sobre um item que hoje NAO esta divergente. E o alvo do cancelamento.
    const cb = await conferir(b.recId, [{ id: b2, quantidade_recebida: 7 }]);
    assert.strictEqual(cb.status, 200, JSON.stringify(cb.body));
    const [ncB2] = await ncsDoItem(b2);
    assert.ok(ncB2 && ncB2.status === 'ABERTA', 'setup: B2 tinha de ter NC automatica ABERTA');
    assert.strictEqual(ncB2.aberto_automaticamente, 1,
      'setup: a NC de B2 tem de ser AUTOMATICA, senao quem a salva e a guarda do cenario (5) e nao o escopo');
    await setQtd(b2, 10);

    // O gesto: conferir A citando os itens de B junto.
    const res = await conferir(a.recId, [
      { id: a.itemId, quantidade_recebida: 9 },
      { id: b1, quantidade_recebida: 3 },
      { id: b2, quantidade_recebida: 10 },
    ]);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // A METADE POSITIVA: o item do PROPRIO recebimento foi atendido — sem isto as tres assercoes
    // de ausencia abaixo passariam identicas com o gancho inteiro desligado.
    const ncsA = await ncsDoItem(a.itemId);
    assert.strictEqual(ncsA.length, 1, `o item do proprio recebimento A tinha de ganhar NC, ganhou ${ncsA.length}`);
    assert.strictEqual(ncsA[0].divergencia, -1, `a NC de A congelou ${ncsA[0].divergencia}`);

    // (a) o item de B nao muda — o escopo do `UPDATE`, que o gancho passa a herdar.
    assert.strictEqual((await itemGravado(b1)).quantidade_recebida, 4,
      'o UPDATE de conferir escreveu no item de OUTRO recebimento');
    assert.strictEqual((await itemGravado(b2)).quantidade_recebida, 10, 'o item B2 foi reescrito por fora');

    // (b) nenhuma NC nasce para o item de B: o documento traria autor, hora e ato de um gesto que
    // nao aconteceu no recebimento dele.
    assert.strictEqual((await ncsDoItem(b1)).length, 0,
      `conferir o recebimento A abriu documento para o item ${b1}, que e do recebimento B`);

    // (c) e a NC ABERTA de B nao e CANCELADA: e destruicao de documento por um gesto que o proprio
    // `UPDATE` ja tinha ignorado — irreversivel, e com motivo automatico afirmando uma correcao
    // que ninguem fez naquele recebimento.
    const depoisB2 = await ncGravada(ncB2.id);
    assert.strictEqual(depoisB2.status, 'ABERTA',
      `a NC ${ncB2.numero}, do recebimento B, ficou ${depoisB2.status} por uma conferencia do recebimento A`);
    assert.strictEqual(depoisB2.motivo_cancelamento, null,
      `a NC de B ganhou motivo de cancelamento: ${JSON.stringify(depoisB2.motivo_cancelamento)}`);
  });

  // ── (5) NC manual nao e apagada pelo gancho ────────────────────────────────────────────────
  await test('(5) [RN-05] o gancho cancela o que ELE abriu; a NC aberta a mao sobrevive a conferencia', async () => {
    const { recId, itemIds } = await novoRecebimento([10, 10]);
    const [manualItem, autoItem] = itemIds;

    // A NC humana: "o peso na balanca nao fecha com a NF, em apuracao" — num item cuja quantidade
    // conferida BATE. Aberta pela porta HTTP, entao `aberto_automaticamente` e 0 por construcao.
    setUser({ ...ADMIN });
    const criada = await request(app).post(BASE).send({
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: manualItem,
      tipo: 'QUANTIDADE', descricao: 'Peso na balanca nao fecha com a NF, em apuracao',
    });
    assert.strictEqual(criada.status, 201, `a abertura manual falhou: ${criada.status} ${JSON.stringify(criada.body)}`);
    assert.strictEqual(criada.body.aberto_automaticamente, 0, 'a NC aberta pela porta HTTP nao e automatica');
    assert.strictEqual(criada.body.divergencia, 0, 'setup: o item da NC manual tem a quantidade BATENDO');

    // O item vizinho ganha uma NC AUTOMATICA e depois e corrigido — os dois documentos ficam no
    // MESMO estado (ABERTA, item sem divergencia). So o de dentro do gancho pode morrer.
    const c1 = await conferir(recId, [{ id: autoItem, quantidade_recebida: 6 }]);
    assert.strictEqual(c1.status, 200, JSON.stringify(c1.body));
    const [ncAuto] = await ncsDoItem(autoItem);
    assert.ok(ncAuto && ncAuto.aberto_automaticamente === 1, 'setup: a NC do vizinho tinha de ser automatica');

    const c2 = await conferir(recId, [
      { id: manualItem, quantidade_recebida: 10 },
      { id: autoItem, quantidade_recebida: 10 },
    ]);
    assert.strictEqual(c2.status, 200, JSON.stringify(c2.body));

    const depoisManual = await ncGravada(criada.body.id);
    assert.strictEqual(depoisManual.status, 'ABERTA',
      `a NC ${criada.body.numero}, escrita por uma PESSOA, foi ${depoisManual.status} por uma conferencia `
      + 'de rotina — o gancho destruiu documento que nao foi ele que escreveu');
    assert.strictEqual(depoisManual.motivo_cancelamento, null,
      `a NC manual ganhou motivo automatico: ${JSON.stringify(depoisManual.motivo_cancelamento)}`);

    // A METADE POSITIVA, no mesmo estado: a RN-05 continua valendo para o documento do gancho.
    const depoisAuto = await ncGravada(ncAuto.id);
    assert.strictEqual(depoisAuto.status, 'CANCELADA',
      `a NC AUTOMATICA ${ncAuto.numero} tinha de ser cancelada pela correcao (RN-05), ficou ${depoisAuto.status} `
      + '— a guarda do documento manual virou mordaca e a NC fantasma voltou a existir');
    assert.ok(/corrigida/i.test(depoisAuto.motivo_cancelamento || ''),
      `o motivo automatico sumiu: ${JSON.stringify(depoisAuto.motivo_cancelamento)}`);
  });

  // ── (6) O `fato` nao e forjavel pela porta HTTP ────────────────────────────────────────────
  //
  // `fato` e `aberto_automaticamente` sao de uso INTERNO dos ganchos. Com a rota repassando
  // `req.body` inteiro, um ALMOXARIFE gravava documento apontando para outro material, com numeros
  // que contradiziam o item — e o "fato congelado", que e a feature inteira, deixava de valer.
  await test('(6) `fato` e `aberto_automaticamente` do corpo HTTP sao IGNORADOS', async () => {
    const { itemId, materiais } = await novoRecebimento([10]);
    await setQtd(itemId, 7);
    const outro = await novoMaterial();
    setUser({ ...ADMIN });

    const forjado = await request(app).post(BASE).send({
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: itemId,
      tipo: 'DANO_FISICO', descricao: 'corpo com fato forjado',
      fato: {
        material_id: outro.id, recebimento_id: null,
        quantidade_esperada: 999, quantidade_recebida: 999, divergencia: 0,
      },
      aberto_automaticamente: 1,
    });
    assert.strictEqual(forjado.status, 201, `a abertura falhou: ${forjado.status} ${JSON.stringify(forjado.body)}`);

    // O documento tem de trazer o fato REAL DO ITEM, nao o do payload.
    assert.strictEqual(forjado.body.material_id, materiais[0].id,
      `o documento foi pendurado no material ${forjado.body.material_id} (o payload pediu ${outro.id}); `
      + `o material do item e ${materiais[0].id}`);
    assert.strictEqual(forjado.body.material_codigo, materiais[0].codigo,
      `a listagem mostra o material ${forjado.body.material_codigo} em vez de ${materiais[0].codigo}`);
    assert.strictEqual(forjado.body.quantidade_esperada, 10, `esperada forjada entrou: ${forjado.body.quantidade_esperada}`);
    assert.strictEqual(forjado.body.quantidade_recebida, 7, `recebida forjada entrou: ${forjado.body.quantidade_recebida}`);
    assert.strictEqual(forjado.body.divergencia, -3,
      `a divergencia gravada foi ${forjado.body.divergencia} — o payload mandou 0 e o item diz -3`);

    // E um documento humano nao pode se declarar automatico: `aberto_automaticamente` decide quem
    // o gancho pode CANCELAR sozinho depois (RN-05), entao forja-lo entrega a NC ao gancho.
    assert.strictEqual(forjado.body.aberto_automaticamente, 0,
      'o corpo HTTP marcou a NC como automatica — a trilha, a listagem e a RN-05 passam a mentir');

    // `fato` pronto DESLIGAVA a unica validacao de existencia que havia: referencia inexistente
    // com `fato` no corpo devolvia 201 e gravava documento pendurado em item que nao existe.
    const fantasma = await request(app).post(BASE).send({
      origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: 987654,
      tipo: 'DANO_FISICO', descricao: 'referencia inexistente com fato pronto',
      fato: { material_id: outro.id, recebimento_id: null, quantidade_esperada: 5, quantidade_recebida: 1, divergencia: -4 },
    });
    assert.strictEqual(fantasma.status, 404,
      `referencia inexistente COM \`fato\` devolveu ${fantasma.status} ${JSON.stringify(fantasma.body)} — `
      + 'o fato pronto desligou a validacao de existencia');
    assert.strictEqual(fantasma.body.error, 'Item de recebimento não encontrado',
      `a mensagem veio "${fantasma.body.error}"`);
    const orfa = await dbGet(db, `SELECT COUNT(*) AS n FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = 987654`);
    assert.strictEqual(orfa.n, 0, `ficou ${orfa.n} documento pendurado em item inexistente`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
