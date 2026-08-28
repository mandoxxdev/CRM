/**
 * Etapa 19, Task 4 (integração) — a jornada de uma MUDANÇA DE REGRA auditada.
 *
 * As Tasks 1-3 provaram cada peça isolada (o diff, a máscara do segredo, o de/para dos
 * cadastros, o RN-02 nos dois arquivos de rota). Este arquivo NÃO repete nada disso: ele prova
 * a COMPOSIÇÃO — que o rastro e o efeito são a MESMA história, medidos por rota real, na ordem
 * em que acontecem na vida:
 *
 *   1. o mundo ANTES da regra: com a tolerância semeada (2%), uma conferência com 5% de
 *      divergência NÃO conclui — a rota exige recontagem;
 *   2. um administrador muda `tolerancia_inventario_percentual` pela rota real de
 *      configurações, no meio das 18 chaves que a tela dispara a cada Salvar → o log registra
 *      o de/para DAQUELA chave e só dela (as 18 não aparecem);
 *   3. o efeito é OBSERVÁVEL: a conferência criada depois nasce com 6%, e a MESMA divergência
 *      de 5% agora conclui sem recontagem — enquanto a conferência aberta ANTES continua
 *      barrada (a regra é congelada na criação, não é retroativa);
 *   4. `GET /auditoria?entidade=configuracao`, lido por um ADMIN comum, devolve a linha no
 *      formato `{ total, limite, offset, truncado, itens }` da Etapa 18.
 *
 * Por que a jornada vale mais que a soma das partes: um log que registra a mudança mas não
 * corresponde ao que a regra passou a fazer é um log que MENTE, e nenhum teste de peça isolada
 * pega isso. Aqui o número do log ('6') é o mesmo que a rota de conferência leu, e o mesmo que
 * aparece no `(limite 6%)`.
 *
 * DOIS USUÁRIOS, DE PROPÓSITO (as duas camadas de autorização do módulo):
 *   - MUDAR a regra exige `canConfigureAlmox` → só `is_superadmin`/`admin_modulos`; um
 *     `role: 'admin'` puro toma 403 (cenário 1 mede isso, para o 200 do cenário 3 não ser
 *     um 200 que qualquer um consegue);
 *   - LER o log exige `requirePermission('configurar')` → `role: 'admin'` basta.
 *
 * NOTA DE HONESTIDADE (para o guia de usuário, registrada aqui porque é aqui que se descobre):
 * `tolerancia_inventario_percentual` é chave SEMEADA e editável pela API, mas NÃO está no array
 * `CAMPOS` da tela de Configurações Gerais (client/src/components/almoxarifado/
 * ConfiguracoesAlmoxarifado.js). A tela só oferece a tolerância POR CONFERÊNCIA (campo
 * `tolerancia_percentual` do POST /conferencias). Esta jornada é honesta pela API; o guia NÃO
 * pode dizer que o administrador muda o padrão global clicando.
 *
 * Executar: cd server && node tests/api/auditoriaConfiguracaoJornada.api.test.js
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

// Muda a regra: passa por canConfigureAlmox.
const ADMIN_ALMOX = { id: 7, nome: 'Ana Superadmin', role: 'admin', is_superadmin: 1, email: 'ana@gmp.com' };
// Lê o log: role 'admin' vira ADMINISTRADOR em getPerfilFromUser, então passa em
// requirePermission('configurar') — mas NÃO passa em canConfigureAlmox.
const ADMIN_SIMPLES = { id: 9, nome: 'Bruno Auditor', role: 'admin', email: 'bruno@gmp.com' };

const CHAVE = 'tolerancia_inventario_percentual';
const TOLERANCIA_ANTIGA = '2';   // semeada em schema.js
const TOLERANCIA_NOVA = '6';

// As 18 chaves do array CAMPOS da tela de Configurações Gerais — a tela manda TODAS a cada
// clique em Salvar, mudadas ou não. É o volume real do payload que faz a RN-04 valer alguma
// coisa: se o diff estiver certo, o log da mudança de tolerância não menciona nenhuma delas.
const CHAVES_TELA = [
  'aprovacao_automatica',
  'permite_saldo_negativo_global',
  'reposicao_janela_consumo_dias',
  'reposicao_dias_sem_consumo',
  'reposicao_horizonte_solicitacao_dias',
  'notificar_movimentacoes',
  'notificacoes_worker_intervalo_min',
  'notificacoes_max_tentativas',
  'alerta_lote_vencendo_dias',
  'alerta_calibracao_dias',
  'alerta_quarentena_dias',
  'alerta_reserva_parada_dias',
  'alerta_eventos_janela_dias',
  'notificacoes_dest_entradas',
  'notificacoes_dest_saidas',
  'notificacoes_dest_ajustes',
  'notificacoes_dest_terceiros',
  'notificacoes_dest_compras',
];

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN_ALMOX });

  const linhasConfig = () => dbAll(db,
    "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'configuracao' AND acao = 'EDICAO' ORDER BY id");

  const configuracoesDaTela = async () => {
    const res = await request(app).get('/api/almoxarifado/configuracoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  const valorNaColuna = async (chave) => {
    const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
    return row ? row.valor : undefined;
  };

  const itemDaConferencia = async (confId, materialId) => {
    const item = await dbGet(db,
      'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
      [confId, materialId]);
    assert.ok(item, `a conferencia ${confId} nao tem item do material ${materialId}`);
    return item;
  };

  // Um material só no banco inteiro: as conferências deste arquivo varrem "todos os materiais
  // ativos", então manter um único material mantém as duas conferências comparáveis item a item.
  const material = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES ('E19-JORNADA', 'Parafuso da jornada', 'UN', 100, 1)`);
  const MATERIAL_ID = material.lastID;

  let confAntes = null;   // criada com a regra ANTIGA
  let confDepois = null;  // criada com a regra NOVA

  // ── 1. O mundo antes: quem pode mudar a regra, e qual regra vale ────────────────────────
  await test('[guarda] a tolerancia comeca em 2% e um ADMIN comum NAO consegue muda-la (403)', async () => {
    // Sem esta guarda o 200 do cenário 3 não provaria nada: seria um 200 que qualquer usuário
    // do módulo consegue, e a "mudança de regra por administrador" seria mudança por qualquer um.
    setUser(ADMIN_ALMOX);
    const configs = await configuracoesDaTela();
    assert.ok(configs[CHAVE], `a chave '${CHAVE}' nao esta semeada — o resto da jornada nao existe`);
    assert.strictEqual(configs[CHAVE].valor, TOLERANCIA_ANTIGA,
      'a tolerancia semeada mudou de valor; a jornada mede o de/para a partir dela');

    // A chave NÃO está na tela — ver a NOTA DE HONESTIDADE do cabeçalho. Se um dia entrar no
    // array CAMPOS, esta asserção quebra e o guia de usuário pode (e deve) ser corrigido junto.
    assert.ok(!CHAVES_TELA.includes(CHAVE),
      `'${CHAVE}' entrou no CAMPOS da tela: atualize o guia de usuario, que hoje NAO promete `
      + 'edicao por clique dessa chave');

    setUser(ADMIN_SIMPLES);
    const negado = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ [CHAVE]: TOLERANCIA_NOVA });
    assert.strictEqual(negado.status, 403,
      `um role:'admin' sem is_superadmin mudou a regra (${negado.status}) — canConfigureAlmox afrouxou`);

    setUser(ADMIN_ALMOX);
    assert.strictEqual(await valorNaColuna(CHAVE), TOLERANCIA_ANTIGA,
      'o 403 respondeu mas a coluna mudou assim mesmo');
    assert.strictEqual((await linhasConfig()).length, 0,
      'um PUT recusado deixou linha de auditoria — o log estaria contando um ato que nao houve');
  });

  await test('ANTES: com 2%, a conferencia com 5% de divergencia NAO conclui (exige recontagem)', async () => {
    setUser(ADMIN_ALMOX);
    const criada = await request(app).post('/api/almoxarifado/conferencias').send({});
    assert.strictEqual(criada.status, 201, JSON.stringify(criada.body));
    confAntes = criada.body;
    assert.strictEqual(Number(confAntes.tolerancia_percentual), Number(TOLERANCIA_ANTIGA),
      'a conferencia nao herdou a tolerancia global — o resto da jornada mediria outra coisa');

    const item = await itemDaConferencia(confAntes.id, MATERIAL_ID);
    const contagem = await request(app)
      .put(`/api/almoxarifado/conferencias/${confAntes.id}/item/${item.id}`)
      .send({ quantidade_contada: 105 }); // 100 no sistema -> divergencia 5 -> 5%
    assert.strictEqual(contagem.status, 200, JSON.stringify(contagem.body));
    assert.strictEqual(contagem.body.divergencia, 5);

    const concluir = await request(app)
      .put(`/api/almoxarifado/conferencias/${confAntes.id}/concluir`).send({});
    assert.strictEqual(concluir.status, 400,
      `com 2% de tolerancia, 5% de divergencia tinha de barrar: ${JSON.stringify(concluir.body)}`);
    assert.ok(concluir.body.error.includes('(limite 2%)'),
      `a recusa nao citou o limite ANTIGO: ${concluir.body.error}`);

    const status = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confAntes.id]);
    assert.strictEqual(status.status, 'ABERTO');
  });

  // ── 2. A mudança de regra, pela rota real, no meio do payload real da tela ───────────────
  await test('o admin muda a tolerancia e o log registra o de/para DAQUELA chave e so dela', async () => {
    setUser(ADMIN_ALMOX);
    const configs = await configuracoesDaTela();
    // Payload EXATAMENTE como o Salvar da tela monta (String(valor ?? '')), mais a chave da
    // regra: 19 chaves saem, UMA mudou.
    const payload = {};
    for (const chave of CHAVES_TELA) {
      assert.ok(configs[chave], `chave '${chave}' da tela sumiu do banco — a lista desatualizou`);
      payload[chave] = String(configs[chave].valor ?? '');
    }
    payload[CHAVE] = TOLERANCIA_NOVA;
    assert.strictEqual(Object.keys(payload).length, 19, 'o payload deixou de ter as 18 da tela + a regra');

    const res = await request(app).put('/api/almoxarifado/configuracoes').send(payload);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasConfig();
    assert.strictEqual(linhas.length, 1,
      `19 chaves enviadas geraram ${linhas.length} linha(s) de auditoria; o contrato e UMA por PUT`);
    const linha = linhas[0];
    const da = JSON.parse(linha.dados_anteriores);
    const dn = JSON.parse(linha.dados_novos);

    assert.deepStrictEqual(Object.keys(dn), [CHAVE],
      `o log trouxe chaves que nao mudaram: ${Object.keys(dn).join(', ')}`);
    assert.deepStrictEqual(Object.keys(da), [CHAVE]);
    assert.strictEqual(da[CHAVE], TOLERANCIA_ANTIGA, 'o "de" nao e a regra que estava valendo');
    assert.strictEqual(dn[CHAVE], TOLERANCIA_NOVA, 'o "para" nao e a regra nova');

    // Explícito: nenhuma das 18 que a tela mandou junto aparece em nenhum dos dois lados.
    for (const chave of CHAVES_TELA) {
      assert.ok(!(chave in dn) && !(chave in da),
        `'${chave}' foi enviada sem mudar e vazou para o log — o ruido que a RN-04 existe para matar`);
    }

    assert.strictEqual(linha.acao, 'EDICAO');
    assert.strictEqual(linha.entidade_id, null, 'entidade_id e INTEGER e a chave e TEXT — tem de ser null');
    assert.strictEqual(linha.usuario_id, ADMIN_ALMOX.id, 'o log nao aponta QUEM mudou a regra');
    assert.strictEqual(linha.usuario_nome, ADMIN_ALMOX.nome);

    // O log não pode estar descrevendo uma escrita que não aconteceu.
    assert.strictEqual(await valorNaColuna(CHAVE), TOLERANCIA_NOVA,
      'o log diz que mudou para 6 e a coluna guarda outra coisa');
  });

  // ── 3. O efeito da regra nova, observável pela mesma rota que barrava ────────────────────
  await test('DEPOIS: a conferencia nova nasce com a tolerancia NOVA (6%)', async () => {
    setUser(ADMIN_ALMOX);
    const criada = await request(app).post('/api/almoxarifado/conferencias').send({});
    assert.strictEqual(criada.status, 201, JSON.stringify(criada.body));
    confDepois = criada.body;
    assert.strictEqual(Number(confDepois.tolerancia_percentual), Number(TOLERANCIA_NOVA),
      'a conferencia criada DEPOIS da mudanca continua com a regra velha — o log registrou uma '
      + 'mudanca que nao mudou nada');
  });

  await test('DEPOIS: a MESMA divergencia de 5% agora conclui sem recontagem', async () => {
    setUser(ADMIN_ALMOX);
    const item = await itemDaConferencia(confDepois.id, MATERIAL_ID);
    const contagem = await request(app)
      .put(`/api/almoxarifado/conferencias/${confDepois.id}/item/${item.id}`)
      .send({ quantidade_contada: 105 });
    assert.strictEqual(contagem.status, 200, JSON.stringify(contagem.body));
    assert.strictEqual(contagem.body.divergencia, 5, 'a divergencia tem de ser a MESMA do cenario ANTES');

    const concluir = await request(app)
      .put(`/api/almoxarifado/conferencias/${confDepois.id}/concluir`).send({});
    assert.strictEqual(concluir.status, 200,
      `a mesma contagem que 2% barrava tinha de passar com 6%: ${JSON.stringify(concluir.body)}`);
    const status = await dbGet(db, 'SELECT status FROM conferencias_almoxarifado WHERE id = ?', [confDepois.id]);
    assert.strictEqual(status.status, 'CONCLUIDO');
  });

  await test('a regra nova NAO e retroativa: a conferencia aberta antes segue barrada em 2%', async () => {
    // A tolerância é congelada na criação (coluna `tolerancia_percentual` da conferência) —
    // mudar a config global no meio de um inventário em andamento não muda o critério dele.
    // Junto com o cenário anterior, é isto que prova que o 200 veio da REGRA NOVA e não de
    // alguma frouxidão geral da rota de conclusão.
    setUser(ADMIN_ALMOX);
    const concluir = await request(app)
      .put(`/api/almoxarifado/conferencias/${confAntes.id}/concluir`).send({});
    assert.strictEqual(concluir.status, 400, JSON.stringify(concluir.body));
    assert.ok(concluir.body.error.includes('(limite 2%)'),
      `a conferencia velha passou a usar a regra nova: ${concluir.body.error}`);
  });

  // ── 4. O log conta a história, para quem só tem permissão de LER ─────────────────────────
  await test('GET /auditoria?entidade=configuracao como ADMIN devolve a linha no formato da Etapa 18', async () => {
    setUser(ADMIN_SIMPLES); // o mesmo usuário que tomou 403 para MUDAR a regra
    const res = await request(app).get('/api/almoxarifado/auditoria?entidade=configuracao');
    assert.strictEqual(res.status, 200,
      `quem tem 'configurar' tem de conseguir LER o log (${res.status}): ${JSON.stringify(res.body)}`);

    const body = res.body;
    assert.ok(!Array.isArray(body), 'a rota voltou a ser array puro — o corte deixaria de ser declarado');
    assert.deepStrictEqual(Object.keys(body).sort(), ['itens', 'limite', 'offset', 'total', 'truncado'],
      `formato fora do contrato da Etapa 18: ${Object.keys(body).join(', ')}`);
    assert.strictEqual(typeof body.total, 'number');
    assert.strictEqual(body.limite, 200);
    assert.strictEqual(body.offset, 0);
    assert.strictEqual(body.truncado, false, 'nada foi truncado nesta jornada');

    // A jornada inteira mexeu em configuração DUAS vezes (uma recusada com 403, uma aceita com
    // 19 chaves) e deixou UMA linha. Este número é o resumo da etapa.
    assert.strictEqual(body.total, 1, `esperava 1 linha de configuracao, vieram ${body.total}`);
    assert.strictEqual(body.itens.length, 1);

    const linha = body.itens[0];
    assert.strictEqual(linha.entidade, 'configuracao');
    assert.strictEqual(linha.acao, 'EDICAO');
    assert.strictEqual(linha.usuario_nome, ADMIN_ALMOX.nome,
      'o log tem de nomear quem MUDOU a regra, nao quem esta lendo');
    const dn = JSON.parse(linha.dados_novos);
    const da = JSON.parse(linha.dados_anteriores);
    assert.strictEqual(da[CHAVE], TOLERANCIA_ANTIGA);
    assert.strictEqual(dn[CHAVE], TOLERANCIA_NOVA);
    assert.ok(linha.created_at, 'a linha nao tem quando');
  });

  await test('paginacao: limite=1&offset=1 declara o corte em vez de mentir o total', async () => {
    // Sem filtro de entidade a jornada tem muito mais linhas (conferencia: CRIACAO, CONTAGEM,
    // CONCLUSAO...). O ponto aqui é que `total` conta a consulta INTEIRA e `truncado` avisa —
    // é o que impede alguém de ler 200 linhas e concluir que o log acabou.
    setUser(ADMIN_SIMPLES);
    const res = await request(app).get('/api/almoxarifado/auditoria?limite=1&offset=1');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.limite, 1);
    assert.strictEqual(res.body.offset, 1);
    assert.strictEqual(res.body.itens.length, 1);
    assert.ok(res.body.total > 2,
      `a jornada devia ter deixado varias linhas no log, veio total=${res.body.total}`);
    assert.strictEqual(res.body.truncado, true, 'leu 1 de muitas e nao declarou o corte');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
