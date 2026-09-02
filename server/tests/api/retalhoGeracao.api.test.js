/**
 * Etapa 9, Task 3 — `gerarRetalho`: o evento composto (SAIDA + ENTRADA_RETALHO + linha de sobra).
 *
 * O modulo NAO TEM TRANSACAO. Entao a forma e a mesma da 8b/8c/returnService: pre-checagem de
 * tudo, perna 1, perna 2, perna 3, e COMPENSACAO explicita se qualquer perna posterior falhar.
 * Metade deste arquivo existe por causa da compensacao — a parte que leitura e suite verde nao
 * pegam, porque o caminho feliz passa igual com ou sem ela.
 *
 * ── A INJECAO NATURAL DA COMPENSACAO (leia antes de mexer) ───────────────────────────────────
 *
 * O plano previa forcar a falha da perna 2 com `material_retalho.controle_lote = 1`. ISSO NAO
 * FUNCIONA NESTA BASE, e a razao esta documentada no proprio motor (stockService.js:569-607): a
 * exigencia de lote e DECLARADA PELO CHAMADOR (`opcoes.exigeLote`), nunca deduzida pelo motor —
 * decisao do cliente de 2026-08-10, tomada depois de a exigencia automatica ter travado quatro
 * fluxos internos que nao tem de onde tirar um lote. A perna 2 (ENTRADA_RETALHO) e um desses
 * casos: nao existe campo de "lote do retalho" no payload, entao o servico NAO declara
 * `exigeLote` la, e um material-retalho com controle_lote entra sem lote em vez de recusar.
 *
 * A injecao usada aqui e outra, igualmente NATURAL (nenhum mock, nenhum stub): a localizacao de
 * destino do retalho BLOQUEADA. `validarLocalizacaoParaMovimento` (stockService.js:364) recusa a
 * perna 2 depois de a perna 1 ja ter baixado o original — que e exatamente o estado que a
 * compensacao existe para desfazer. Escolhida tambem por ser a unica classe de falha que o
 * servico NAO pode pre-checar sem duplicar uma regra do motor (duas fontes da mesma regra
 * divergem na primeira mudanca — licao do proprio modulo).
 *
 * SE ESTE TESTE COMECAR A FALHAR porque alguem passou a pre-checar a localizacao no servico: a
 * correcao e achar OUTRA falha natural depois da perna 1, nao apagar as assercoes de compensacao.
 * Sem elas o arquivo volta a provar so o caminho feliz.
 *
 * ── LACUNA DECLARADA: a compensacao da PERNA 2 nao tem teste, e nao por esquecimento ─────────
 *
 * `compensarRetalho` tambem estorna a ENTRADA_RETALHO quando a perna 3 (o INSERT da sobra) falha.
 * Esse ramo NAO e exercitado aqui porque a perna 3 nao tem como falhar por DADO nesta base — foi
 * medido, nao suposto: (a) a tabela `sobras_material_almoxarifado` nao tem NOT NULL, UNIQUE, CHECK
 * nem FK nas colunas gravadas; (b) o driver `sqlite3` ACEITA qualquer tipo no bind (objeto, array,
 * funcao, BigInt, Symbol, NaN — os oito testados passaram), entao nem valor absurdo derruba o
 * INSERT. Sobra a falha de RUNTIME de verdade (banco fora do ar, SQLITE_BUSY), que este harness nao
 * produz sem mock — e mock aqui provaria o mock, nao a compensacao. Quem for cobrir isso: o caminho
 * honesto e uma falha real de banco, nao um stub de `dbRun`.
 *
 * Executar: cd server && node tests/api/retalhoGeracao.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const scrapService = require('../../services/almoxarifado/scrapService');
const { GerarRetalhoSchema } = require('../../services/almoxarifado/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, {
  atual = 0, custo = 0, controle_lote = 0, controle_serie = 0, dono = null, ativo = 1,
} = {}) {
  seq += 1;
  const codigo = `RTG-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, controle_lote,
       controle_serie, proprietario_cliente_id, tipo_material, ativo)
    VALUES (?,?,'UN',?,?,?,?,?,?,'ACO',?)`,
  [codigo, `Material retalho ${seq}`, atual, custo, custo, controle_lote, controle_serie, dono, ativo]);
  return { id: r.lastID, codigo };
}

const est = async (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(custo_medio,0) AS custo_medio,
          COALESCE(custo_unitario,0) AS custo_unitario
   FROM materiais_almoxarifado WHERE id = ?`, [id]);

const sobrasDe = async (db, materialOrigemId) => dbAll(db,
  'SELECT * FROM sobras_material_almoxarifado WHERE material_id = ?', [materialOrigemId]);

const movsDe = async (db, materialId) => dbAll(db,
  'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [materialId]);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });
  const clienteAlfa = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;

  // ── O caso da spec 15, com o nome dela ──────────────────────────────────────────────────────
  await test('consumo parcial gera retalho na mesma transacao', async () => {
    const origem = await novoMaterial(db, { atual: 100 });
    const retalho = await novoMaterial(db, { atual: 0 });

    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id,
      material_retalho_id: retalho.id,
      baixar_original: true,
      quantidade_baixa: 30,
      quantidade_retalho: 1,
      justificativa: 'corte da chapa para a OS 123',
      dimensoes_originais: '3000x1500x12,7',
      dimensoes_restantes: '1800x1500x12,7',
      norma: 'ASTM A36',
      espessura: 12.7,
      largura: 1500,
      comprimento: 1800,
      peso_aproximado: 260,
      material_descricao: 'Meia chapa de aco carbono',
    });

    assert.ok(r.movimentacao_baixa_id, 'a perna 1 (SAIDA) nao devolveu id de movimentacao');
    assert.ok(r.movimentacao_entrada_id, 'a perna 2 (ENTRADA_RETALHO) nao devolveu id de movimentacao');
    assert.ok(r.sobra && r.sobra.id, 'a perna 3 (linha de sobra) nao devolveu a sobra criada');

    const eOrigem = await est(db, origem.id);
    const eRetalho = await est(db, retalho.id);
    assert.strictEqual(eOrigem.quantidade_atual, 70, 'a baixa do material de origem nao aconteceu');
    assert.strictEqual(eRetalho.quantidade_atual, 1, 'o retalho nao foi creditado no material-retalho');

    // A linha de sobra: o anexo dimensional, com os DOIS lados do evento amarrados (decisao 1).
    const sobras = await sobrasDe(db, origem.id);
    assert.strictEqual(sobras.length, 1, `esperava 1 linha de sobra, achou ${sobras.length}`);
    const s = sobras[0];
    assert.strictEqual(s.material_retalho_id, retalho.id, 'sobra nao guardou o material-retalho');
    assert.strictEqual(s.movimentacao_baixa_id, r.movimentacao_baixa_id, 'sobra nao guardou a movimentacao de baixa');
    assert.strictEqual(s.movimentacao_entrada_id, r.movimentacao_entrada_id, 'sobra nao guardou a movimentacao de entrada');
    assert.strictEqual(s.status, 'DISPONIVEL');
    assert.strictEqual(s.reutilizavel, 1);
    assert.strictEqual(s.criado_por_id, ADMIN.id, 'sobra nao gravou quem gerou o retalho');
    assert.strictEqual(s.criado_por_nome, ADMIN.nome);
    assert.strictEqual(s.dimensoes_restantes, '1800x1500x12,7');
    assert.strictEqual(s.norma, 'ASTM A36');
    assert.strictEqual(s.largura, 1500);
    assert.strictEqual(s.comprimento, 1800);
    assert.strictEqual(s.espessura, 12.7);

    // O livro: os dois lancamentos existem, com os tipos certos e nos materiais certos.
    const movsOrigem = await movsDe(db, origem.id);
    assert.strictEqual(movsOrigem.length, 1, 'a origem deveria ter exatamente 1 lancamento');
    assert.strictEqual(movsOrigem[0].tipo, 'SAIDA');
    assert.strictEqual(movsOrigem[0].quantidade, 30);
    const movsRetalho = await movsDe(db, retalho.id);
    assert.strictEqual(movsRetalho.length, 1, 'o material-retalho deveria ter exatamente 1 lancamento');
    assert.strictEqual(movsRetalho[0].tipo, 'ENTRADA_RETALHO');
    assert.strictEqual(movsRetalho[0].quantidade, 1);
    assert.ok(movsRetalho[0].justificativa.includes(origem.codigo),
      `a justificativa da entrada nao cita o material de origem: ${movsRetalho[0].justificativa}`);

    // Auditoria (paga a pendencia da spec 23). CONTROLE POSITIVO: conta as linhas DESTA sobra —
    // sem a chamada de registrarAuditoria a contagem e 0 e esta assercao cai.
    const log = await dbAll(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade='sobra' AND entidade_id=?", [s.id]);
    assert.strictEqual(log.length, 1, `esperava 1 linha de auditoria, achou ${log.length}`);
    assert.strictEqual(log[0].acao, 'gerar_retalho');
    assert.strictEqual(log[0].usuario_id, ADMIN.id);
    const novos = JSON.parse(log[0].dados_novos);
    assert.strictEqual(novos.movimentacao_baixa_id, r.movimentacao_baixa_id,
      'auditoria nao registrou o id da movimentacao de baixa');
    assert.strictEqual(novos.movimentacao_entrada_id, r.movimentacao_entrada_id,
      'auditoria nao registrou o id da movimentacao de entrada');
  });

  // ── O segundo caso da spec 15, com o nome dela ──────────────────────────────────────────────
  await test('retalho referencia lote original', async () => {
    const origem = await novoMaterial(db, { atual: 50, controle_lote: 1 });
    const retalho = await novoMaterial(db, { atual: 0 });
    const lote = (await dbRun(db,
      "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?,?,'ATIVO')",
      [origem.id, 'CORRIDA-9911'])).lastID;
    // a saida so pode consumir da linha de saldo daquele lote
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,NULL,?,?)',
      [origem.id, lote, 50]);

    // SEM lote: recusa, e recusa ANTES de mover qualquer coisa.
    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: retalho.id,
        baixar_original: true, quantidade_baixa: 10, justificativa: 'corte sem informar lote',
      }),
      /lote/i,
      'origem com controle_lote gerou retalho sem lote_origem_id');
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 50, 'baixou mesmo recusando');
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0, 'criou sobra mesmo recusando');

    // COM lote: passa e o vinculo fica GRAVADO na sobra (e o "manter vinculo com o lote
    // original" do requisito) e tambem na movimentacao de baixa.
    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id,
      baixar_original: true, quantidade_baixa: 10, lote_origem_id: lote,
      justificativa: 'corte da corrida 9911',
    });
    const s = (await sobrasDe(db, origem.id))[0];
    assert.strictEqual(s.lote_origem_id, lote, 'a sobra nao guardou o lote de origem');
    const movBaixa = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [r.movimentacao_baixa_id]);
    assert.strictEqual(movBaixa.lote_id, lote, 'a SAIDA nao citou o lote no livro');
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 40);
  });

  await test('[CONTROLE POSITIVO] origem SEM controle_lote gera retalho sem informar lote', async () => {
    // Sem este controle, uma exigencia de lote escrita larga demais (para todo material) passaria
    // no teste acima e travaria a operacao normal — que e o material sem controle de lote.
    const origem = await novoMaterial(db, { atual: 20 });
    const retalho = await novoMaterial(db, { atual: 0 });
    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id,
      baixar_original: true, quantidade_baixa: 5, justificativa: 'corte de barra sem rastreio de lote',
    });
    assert.ok(r.sobra.id);
    assert.strictEqual(r.sobra.lote_origem_id, null);
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 15);
  });

  await test('modo baixar_original:false credita so o retalho e deixa a baixa NULL', async () => {
    // A peca original ja saiu do estoque antes (requisicao entregue): a sobra VOLTA do chao de
    // fabrica. Nao ha o que baixar — e inventar uma baixa aqui tiraria do saldo material que ja
    // nao esta la.
    const origem = await novoMaterial(db, { atual: 80 });
    const retalho = await novoMaterial(db, { atual: 0 });

    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id,
      baixar_original: false,
      dimensoes_restantes: '900x400',
    });

    assert.strictEqual(r.movimentacao_baixa_id, null, 'modo sem baixa emitiu movimentacao de baixa');
    assert.ok(r.movimentacao_entrada_id, 'modo sem baixa nao creditou o retalho');
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 80, 'baixou o original no modo sem baixa');
    // quantidade_retalho tem default 1 (o corte devolve UMA peca, e o caso comum)
    assert.strictEqual((await est(db, retalho.id)).quantidade_atual, 1);
    assert.strictEqual((await movsDe(db, origem.id)).length, 0, 'o material de origem ganhou lancamento no modo sem baixa');

    const s = (await sobrasDe(db, origem.id))[0];
    assert.strictEqual(s.movimentacao_baixa_id, null, 'a sobra gravou uma baixa que nao existe');
    assert.strictEqual(s.movimentacao_entrada_id, r.movimentacao_entrada_id);

    // Fix round 1 (achado do review): a frase montada pelo servico era construida sempre com
    // `quantidade_baixa`, que neste modo e `undefined` de proposito — e ia parar na AUDITORIA como
    // "...: undefined UN baixados...". Registro que mente e pior do que registro ausente: quem
    // auditasse este retalho leria uma baixa que nunca existiu.
    const log = await dbGet(db,
      "SELECT justificativa, dados_novos FROM auditoria_log_almoxarifado WHERE entidade='sobra' AND entidade_id=?", [s.id]);
    assert.ok(log, 'o evento sem baixa nao gravou auditoria');
    assert.ok(!/undefined/.test(log.justificativa),
      `a justificativa auditada fala de uma baixa inexistente: ${log.justificativa}`);
    assert.ok(!/undefined/.test(log.dados_novos),
      `dados_novos da auditoria carrega "undefined": ${log.dados_novos}`);
  });

  // ── controle_serie: recusa ANTES de mover, porque aqui a compensacao nao salva ───────────────
  await test('origem com controle_serie e recusada no modo com baixa (a compensacao nao teria como rodar)', async () => {
    // Achado do review. A SAIDA sairia SEM reivindicar serie (nao ha campo no payload), e o
    // estorno dela e recusado pela guarda de stockService.js:1434 — entao, se a perna 2 falhasse,
    // `compensarRetalho` estouraria no estorno da baixa (que de proposito nao tem `.catch`) e o
    // material de origem ficaria BAIXADO sem retalho nenhum em troca. Recusar antes e o unico
    // jeito de esse estado nao existir.
    const origem = await novoMaterial(db, { atual: 40, controle_serie: 1 });
    const retalho = await novoMaterial(db, { atual: 0 });
    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: retalho.id,
        baixar_original: true, quantidade_baixa: 10, justificativa: 'corte de material serializado',
      }),
      /serie/i);
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 40, 'baixou material serializado mesmo recusando');
    assert.strictEqual((await est(db, retalho.id)).quantidade_atual, 0);
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0);
  });

  await test('[CONTROLE POSITIVO] o MESMO cenario sem controle_serie passa', async () => {
    // Sem este controle, uma guarda escrita larga demais (recusar toda geracao com baixa) passaria
    // no teste acima e mataria o caso principal da etapa.
    const origem = await novoMaterial(db, { atual: 40 });
    const retalho = await novoMaterial(db, { atual: 0 });
    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id,
      baixar_original: true, quantidade_baixa: 10, justificativa: 'corte de material sem serie',
    });
    assert.ok(r.sobra.id);
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 30);
  });

  await test('[CONTROLE POSITIVO] origem serializada PASSA no modo sem baixa — nada e movido nela', async () => {
    // A checagem da origem e gateada pelo modo de proposito: sem baixa, nenhuma movimentacao toca
    // o material serializado, o invariante da Etapa 6b nao e tocado e nao ha estorno a recusar.
    // Recusar aqui tambem seria falsa recusa — e este e justamente o caminho que a mensagem de
    // erro do teste anterior ensina ao operador.
    const origem = await novoMaterial(db, { atual: 40, controle_serie: 1 });
    const retalho = await novoMaterial(db, { atual: 0 });
    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id, baixar_original: false,
    });
    assert.ok(r.sobra.id);
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 40);
    assert.strictEqual((await movsDe(db, origem.id)).length, 0);
  });

  await test('material_retalho com controle_serie e recusado nos DOIS modos', async () => {
    // Espelho do caso acima, e pior: a ENTRADA_RETALHO creditaria sem serie (saldo maior que a
    // contagem de series, invariante quebrado na hora) e ficaria impossivel de estornar para
    // sempre — e no ramo da perna 3 o `.catch` engoliria a recusa, deixando retalho fantasma.
    const origem = await novoMaterial(db, { atual: 40 });
    const retalhoSerializado = await novoMaterial(db, { atual: 0, controle_serie: 1 });
    for (const modo of [false, true]) {
      await assert.rejects(
        () => scrapService.gerarRetalho(db, ADMIN, {
          material_origem_id: origem.id, material_retalho_id: retalhoSerializado.id,
          baixar_original: modo, quantidade_baixa: modo ? 10 : undefined,
          justificativa: 'retalho em material serializado',
        }),
        /serie/i,
        `modo baixar_original:${modo} aceitou material-retalho serializado`);
    }
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 40, 'baixou a origem mesmo recusando');
    assert.strictEqual((await est(db, retalhoSerializado.id)).quantidade_atual, 0);
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0);
  });

  await test('retalho de material de cliente com dono DIFERENTE e recusado, nomeando os dois donos', async () => {
    const origem = await novoMaterial(db, { atual: 40, dono: clienteAlfa });
    const retalhoNosso = await novoMaterial(db, { atual: 0 });

    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: retalhoNosso.id,
        baixar_original: false,
      }),
      (e) => {
        assert.ok(/Alfa/.test(e.message), `a recusa nao nomeia o dono da origem: ${e.message}`);
        assert.ok(/estoque proprio/i.test(e.message), `a recusa nao diz que o retalho e' de estoque proprio: ${e.message}`);
        assert.ok(e.message.includes(origem.codigo) && e.message.includes(retalhoNosso.codigo),
          `a recusa nao cita os dois codigos: ${e.message}`);
        return true;
      });
    assert.strictEqual((await est(db, retalhoNosso.id)).quantidade_atual, 0, 'creditou mesmo recusando');
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0, 'criou sobra mesmo recusando');
  });

  await test('[CONTROLE POSITIVO] retalho com o MESMO dono da origem passa', async () => {
    // Sem este controle, uma guarda escrita ao contrario (recusar sempre que houver dono) passaria
    // no teste acima e tornaria impossivel retalhar material de cliente — que e o caso que a
    // decisao 5 do design existe para PERMITIR, com o dono preservado.
    const origem = await novoMaterial(db, { atual: 40, dono: clienteAlfa });
    const retalhoDoCliente = await novoMaterial(db, { atual: 0, dono: clienteAlfa });
    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalhoDoCliente.id,
      baixar_original: false, quantidade_retalho: 2,
    });
    assert.ok(r.sobra.id);
    assert.strictEqual((await est(db, retalhoDoCliente.id)).quantidade_atual, 2);
  });

  await test('o retalho nunca infla o patrimonio: custo do material-retalho intacto', async () => {
    // Decisao 4: o projeto ja pagou a chapa inteira na SAIDA. O servico NUNCA passa custo para o
    // motor — e o payload nao tem por onde dita-lo (o campo nem existe no schema).
    const origem = await novoMaterial(db, { atual: 60, custo: 100 });
    const retalho = await novoMaterial(db, { atual: 10, custo: 40 });

    await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id,
      baixar_original: true, quantidade_baixa: 20, quantidade_retalho: 5,
      justificativa: 'corte com custo forjado no payload',
      custo_unitario: 999, // ignorado: o servico nao repassa custo
    });

    const e = await est(db, retalho.id);
    assert.strictEqual(e.quantidade_atual, 15);
    assert.strictEqual(e.custo_medio, 40, 'a entrada do retalho mexeu no custo medio do material-retalho');
    assert.strictEqual(e.custo_unitario, 40, 'a entrada do retalho mexeu no custo unitario do material-retalho');
  });

  await test('saldo insuficiente na origem recusa e nao deixa rastro', async () => {
    // A perna 1 e a PRIMEIRA coisa que se move, e a guarda de disponivel do motor roda antes do
    // efeito dela — entao "recusa antes de qualquer perna" e o que acontece de fato, sem o
    // servico reescrever a formula do disponivel (que tem fonte unica em availabilitySql.js).
    const origem = await novoMaterial(db, { atual: 5 });
    const retalho = await novoMaterial(db, { atual: 0 });
    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: retalho.id,
        baixar_original: true, quantidade_baixa: 50, justificativa: 'corte maior que o saldo',
      }),
      /saldo/i);
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 5);
    assert.strictEqual((await est(db, retalho.id)).quantidade_atual, 0, 'creditou retalho sem baixar a origem');
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0);
  });

  await test('material-retalho inexistente recusa com mensagem que ensina o caminho', async () => {
    const origem = await novoMaterial(db, { atual: 10 });
    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: 999999, baixar_original: false,
      }),
      /cadastre o material/i);
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0);
  });

  await test('material-retalho IGUAL ao de origem e recusado', async () => {
    // Retalhar um material para ele mesmo seria uma SAIDA e uma ENTRADA no mesmo saldo: o numero
    // muda (baixa 30, entra 1) sem nada ter mudado no mundo fisico, e a sobra apontaria para si
    // mesma. Mesmo criterio da transformacao da 8c ("o resultado e o MESMO material da chapa").
    const origem = await novoMaterial(db, { atual: 30 });
    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: origem.id,
        baixar_original: true, quantidade_baixa: 10, justificativa: 'corte para si mesmo',
      }),
      /mesmo material/i);
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 30);
  });

  // ── COMPENSACAO: a razao de existir da metade deste arquivo ─────────────────────────────────
  await test('falha na perna 2 COMPENSA a perna 1: saldo do original restaurado e nenhuma sobra', async () => {
    // Injecao NATURAL (ver o cabecalho): localizacao de destino bloqueada. A perna 1 ja baixou o
    // original quando `validarLocalizacaoParaMovimento` recusa a perna 2.
    seq += 1;
    const locBloqueada = (await dbRun(db,
      'INSERT INTO localizacoes_almoxarifado (codigo, descricao, bloqueada, ativo) VALUES (?,?,1,1)',
      [`RTG-BLOQ-${seq}`, 'Prateleira interditada'])).lastID;
    const origem = await novoMaterial(db, { atual: 100 });
    const retalho = await novoMaterial(db, { atual: 0 });

    await assert.rejects(
      () => scrapService.gerarRetalho(db, ADMIN, {
        material_origem_id: origem.id, material_retalho_id: retalho.id,
        baixar_original: true, quantidade_baixa: 30, localizacao_id: locBloqueada,
        justificativa: 'corte cujo destino esta interditado',
      }),
      /bloqueada/i,
      'a perna 2 passou numa localizacao bloqueada — a injecao natural deste teste morreu, ache outra');

    // ESTA e a assercao que a sabotagem do Step 5 tem de derrubar: sem a compensacao da perna 1,
    // o original fica baixado a toa (70) por causa de um retalho que NUNCA entrou.
    assert.strictEqual((await est(db, origem.id)).quantidade_atual, 100,
      'a perna 1 nao foi compensada: o material de origem ficou baixado sem retalho nenhum em troca');
    assert.strictEqual((await est(db, retalho.id)).quantidade_atual, 0, 'a perna 2 creditou apesar de ter falhado');
    assert.strictEqual((await sobrasDe(db, origem.id)).length, 0, 'criou linha de sobra para um evento que falhou');

    // O livro fica HONESTO: a saida existe, marcada cancelada, com a linha de ESTORNO ao lado —
    // e o mesmo criterio de compensarTransformacao (8c), que compensa estornando de verdade em
    // vez de apagar a linha.
    const movs = await movsDe(db, origem.id);
    const saida = movs.find((m) => m.tipo === 'SAIDA');
    assert.ok(saida, 'a perna 1 nem chegou a ser emitida — o teste nao esta exercitando a compensacao');
    assert.strictEqual(saida.cancelado, 1, 'a saida compensada nao ficou marcada como cancelada no livro');
    assert.ok(movs.some((m) => m.tipo === 'ESTORNO'), 'a compensacao nao deixou linha de ESTORNO no livro');
  });

  await test('nao ha auditoria de sobra quando o evento falha no meio', async () => {
    // Auditar um evento compensado deixaria no log um retalho que nao existe — e o log de sobra e
    // justamente o que a spec 23 cobra para responder "quem gerou este retalho".
    seq += 1;
    const locBloqueada = (await dbRun(db,
      'INSERT INTO localizacoes_almoxarifado (codigo, descricao, bloqueada, ativo) VALUES (?,?,1,1)',
      [`RTG-BLOQ-${seq}`, 'Prateleira interditada 2'])).lastID;
    const origem = await novoMaterial(db, { atual: 10 });
    const retalho = await novoMaterial(db, { atual: 0 });
    const antes = (await dbAll(db, "SELECT id FROM auditoria_log_almoxarifado WHERE entidade='sobra' AND acao='gerar_retalho'")).length;

    await assert.rejects(() => scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id,
      baixar_original: true, quantidade_baixa: 2, localizacao_id: locBloqueada,
      justificativa: 'corte que vai falhar',
    }));

    const depois = (await dbAll(db, "SELECT id FROM auditoria_log_almoxarifado WHERE entidade='sobra' AND acao='gerar_retalho'")).length;
    assert.strictEqual(depois, antes, 'gravou auditoria de um retalho que foi compensado');
  });

  // ── Schema ─────────────────────────────────────────────────────────────────────────────────
  await test('[schema] GerarRetalhoSchema exige os dois materiais e o modo', async () => {
    assert.ok(!GerarRetalhoSchema.safeParse({ material_retalho_id: 1, baixar_original: false }).success,
      'aceitou payload sem material_origem_id');
    assert.ok(!GerarRetalhoSchema.safeParse({ material_origem_id: 1, baixar_original: false }).success,
      'aceitou payload sem material_retalho_id');
    // `baixar_original` NAO tem default de proposito: o campo esquecido no meio do caminho
    // viraria "false" e creditaria retalho SEM baixar o original — saldo do nada, em silencio.
    assert.ok(!GerarRetalhoSchema.safeParse({ material_origem_id: 1, material_retalho_id: 2 }).success,
      'aceitou payload sem declarar o modo (baixar_original)');
  });

  await test('[schema] baixar_original sem quantidade_baixa e recusado', async () => {
    const r = GerarRetalhoSchema.safeParse({ material_origem_id: 1, material_retalho_id: 2, baixar_original: true });
    assert.ok(!r.success, 'aceitou baixa sem quantidade a baixar');
  });

  await test('[schema] custo NAO e declarado — o cliente nao dita o custo do retalho pela API', async () => {
    // Mesma armadilha boa de `custo_unitario_aplicado` em TransformacaoRemessaSchema (8c):
    // z.object DESCARTA chave nao declarada, entao o campo nem chega ao servico.
    const r = GerarRetalhoSchema.safeParse({
      material_origem_id: 1, material_retalho_id: 2, baixar_original: false,
      custo_unitario: 999, custo_medio: 999,
    });
    assert.ok(r.success, JSON.stringify(r.error && r.error.issues));
    assert.ok(!('custo_unitario' in r.data), 'o schema deixou passar custo_unitario para o servico');
    assert.ok(!('custo_medio' in r.data), 'o schema deixou passar custo_medio para o servico');
  });

  await test('[schema] preserva os campos que o servico usa de verdade', async () => {
    // z.object descarta chave NAO declarada em silencio: campo do design que falte aqui chega
    // como `undefined` no servico e some sem erro nenhum — foi o molde do teste da 8c.
    const r = GerarRetalhoSchema.safeParse({
      material_origem_id: 1, material_retalho_id: 2, baixar_original: true, quantidade_baixa: 3,
      quantidade_retalho: 2, lote_origem_id: 7, localizacao_id: 9,
      projeto_id: 11, os_id: 12, centro_custo_id: 13, justificativa: 'corte',
      dimensoes_originais: '3000x1500', dimensoes_restantes: '1800x1500', norma: 'A36',
      espessura: 12.7, diametro: 0, largura: 1500, comprimento: 1800, peso_aproximado: 260,
      material_descricao: 'meia chapa', observacoes: 'na prateleira B',
      projeto_origem_id: 14, os_origem_id: 15,
    });
    assert.ok(r.success, JSON.stringify(r.error && r.error.issues));
    for (const k of ['quantidade_retalho', 'lote_origem_id', 'localizacao_id', 'projeto_id', 'os_id',
      'centro_custo_id', 'justificativa', 'dimensoes_originais', 'dimensoes_restantes', 'norma',
      'espessura', 'diametro', 'largura', 'comprimento', 'peso_aproximado', 'material_descricao',
      'observacoes', 'projeto_origem_id', 'os_origem_id']) {
      assert.ok(k in r.data, `o schema descartou o campo ${k} — ele nunca chegaria ao servico`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
