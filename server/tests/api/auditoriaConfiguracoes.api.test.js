/**
 * Etapa 19, Task 1 — auditoria das 5 rotas de CONFIGURAÇÃO.
 *
 * O que este arquivo prova (e por que cada asserção existe):
 *
 * - RN-04: `PUT /configuracoes` manda as 18 chaves da tela a CADA clique em Salvar, mudadas ou
 *   não. Auditar por chave daria 18 linhas por save, quase todas "de X para X" — ruído que
 *   enterra o sinal. Aqui: 18 chaves com 1 alterada → UMA linha com UMA chave no de/para;
 *   18 chaves sem nenhuma alteração → ZERO linhas.
 * - RN-05: `alertas_smtp_pass` e `alertas_whatsapp_api_key` são SEGREDO. O log diz
 *   '(alterado)' e o valor NUNCA aparece — asserção NEGATIVA sobre o texto cru da coluna,
 *   não sobre o objeto já parseado (é a coluna que vaza, não o objeto).
 * - RN-06: `PUT /configuracoes/estoques-minimos` não é configuração, é edição em lote de
 *   material — uma linha por material EFETIVAMENTE alterado, não uma por request.
 * - RN-02: auditoria quebrada não derruba o ato. O stub tem TRÊS asserções juntas (flag
 *   `chamado`, o ato responde e gravou, zero linhas): sem a primeira, uma rota que
 *   simplesmente NÃO auditasse passaria verde e o teste seria vazio.
 *
 * ANTI-TESTE-VAZIO: o `require` do configDiff é lazy de propósito (senão o arquivo inteiro
 * morre com "Cannot find module" antes da implementação e o vermelho do Step 2 não diz nada);
 * a lista das 18 chaves tem guarda de tamanho e de presença no banco.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const auditModule = require('../../services/almoxarifado/audit');

let configDiff = null;
try {
  // eslint-disable-next-line global-require
  configDiff = require('../../services/almoxarifado/configDiff');
} catch (_) {
  configDiff = null; // vermelho esperado no Step 2; o teste da funcao pura acusa.
}

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// As 18 chaves da aba "Configurações Gerais" (client/src/components/almoxarifado/
// ConfiguracoesAlmoxarifado.js, const CAMPOS). A lista está aqui em vez de ser lida do disco
// porque o que este teste precisa é do TAMANHO REAL do payload que a tela manda — 18 chaves
// num único PUT é o cenário da RN-04.
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

const SEGREDO_SMTP = 'senha-SMTP-secretissima-9X7';
const SEGREDO_WPP = 'token-WhatsApp-secretissimo-4K2';

(async () => {
  // canConfigureAlmox NAO aceita role 'admin' sozinho: o usuario default do harness
  // ({id:1, role:'admin'}) toma 403 em TODAS as rotas desta task e os testes passariam
  // "verdes" sem nunca ter escrito nada. Precedente: tests/api/materialCompleto.api.test.js:26.
  const { app, db, close } = await createTestApp({
    user: { id: 7, nome: 'Admin Almox', role: 'admin', is_superadmin: 1 },
  });

  const linhasDe = (entidade, acao, entidadeId) => {
    let sql = 'SELECT * FROM auditoria_log_almoxarifado WHERE entidade = ? AND acao = ?';
    const params = [entidade, acao];
    if (entidadeId !== undefined) { sql += ' AND entidade_id = ?'; params.push(entidadeId); }
    return dbAll(db, `${sql} ORDER BY id`, params);
  };
  const contarConfig = async () => (await linhasDe('configuracao', 'EDICAO')).length;
  const ultimaConfig = async () => {
    const rows = await linhasDe('configuracao', 'EDICAO');
    return rows[rows.length - 1];
  };

  // Payload no formato exato da tela: as 18 chaves, valor atual (string), a cada Salvar.
  const payloadDaTela = async (overrides = {}) => {
    const res = await request(app).get('/api/almoxarifado/configuracoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const payload = {};
    for (const chave of CHAVES_TELA) {
      assert.ok(res.body[chave], `chave '${chave}' da tela nao existe no GET — lista desatualizada`);
      payload[chave] = String(res.body[chave].valor ?? '');
    }
    return { ...payload, ...overrides };
  };

  // ── Guarda anti-teste-vazio ─────────────────────────────────────────────────────────────
  await test('[guarda] as 18 chaves da tela existem e o usuario do teste NAO toma 403', async () => {
    assert.strictEqual(CHAVES_TELA.length, 18, 'a lista deixou de refletir as 18 chaves da tela');
    const payload = await payloadDaTela();
    const res = await request(app).put('/api/almoxarifado/configuracoes').send(payload);
    assert.strictEqual(res.status, 200, `PUT recusado (${res.status}): ${JSON.stringify(res.body)} `
      + '— se for 403, o usuario do harness nao passa por canConfigureAlmox e TODOS os cenarios '
      + 'abaixo estariam provando nada');
  });

  // ── A funcao pura do diff (C1) ──────────────────────────────────────────────────────────
  await test('calcularDiff: so as chaves que MUDARAM entram no de/para', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    const { calcularDiff } = configDiff;
    const d = calcularDiff({ a: '1', b: '2', c: '3' }, { a: '1', b: '9', c: '3' });
    assert.deepStrictEqual(d.anteriores, { b: '2' });
    assert.deepStrictEqual(d.novos, { b: '9' });
  });

  await test('calcularDiff: zero mudancas devolve os dois lados VAZIOS', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    const d = configDiff.calcularDiff({ a: '1', b: '2' }, { a: '1', b: '2' });
    assert.deepStrictEqual(d.anteriores, {});
    assert.deepStrictEqual(d.novos, {});
  });

  await test('calcularDiff: chave NOVA entra com anterior null', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    const d = configDiff.calcularDiff({ a: '1' }, { a: '1', nova: 'x' });
    assert.deepStrictEqual(d.anteriores, { nova: null });
    assert.deepStrictEqual(d.novos, { nova: 'x' });
  });

  await test('calcularDiff: itera Object.keys(NOVOS), nunca a uniao — chave ausente do payload e IGNORADA', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    // Cenario REAL da rota 13: `anteriores` vem de um SELECT SEM WHERE (a tabela inteira,
    // ~45 chaves) e o payload tem 18. Iterar a uniao reportaria ~27 chaves "removidas" em
    // TODO save — exatamente o ruido que a RN-04 existe para matar.
    const anteriores = {};
    for (let i = 0; i < 40; i++) anteriores[`fora_do_payload_${i}`] = 'valor';
    anteriores.no_payload = 'antigo';
    const d = configDiff.calcularDiff(anteriores, { no_payload: 'novo' });
    assert.deepStrictEqual(Object.keys(d.novos), ['no_payload'],
      `o diff vazou chaves que o payload nem mandou: ${Object.keys(d.novos).join(', ')}`);
    assert.deepStrictEqual(d.anteriores, { no_payload: 'antigo' });
  });

  await test('calcularDiff: compara os dois lados JA na forma persistida (30 e "30" nao e mudanca)', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    const d = configDiff.calcularDiff({ n: '30' }, { n: 30 });
    assert.deepStrictEqual(d.novos, {}, 'numero contra a string equivalente virou "mudanca"');
  });

  await test('calcularDiff: SEGREDO alterado entra mascarado nos DOIS lados (RN-05)', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    assert.ok(Array.isArray(configDiff.CHAVES_SECRETAS) && configDiff.CHAVES_SECRETAS.length >= 2,
      'CHAVES_SECRETAS nao exportada');
    const d = configDiff.calcularDiff(
      { alertas_smtp_pass: 'antiga-123', alertas_whatsapp_api_key: 'tok-antigo' },
      { alertas_smtp_pass: SEGREDO_SMTP, alertas_whatsapp_api_key: SEGREDO_WPP },
    );
    assert.strictEqual(d.novos.alertas_smtp_pass, '(alterado)');
    assert.strictEqual(d.anteriores.alertas_smtp_pass, '(alterado)');
    assert.strictEqual(d.novos.alertas_whatsapp_api_key, '(alterado)');
    const bruto = JSON.stringify(d);
    assert.ok(!bruto.includes(SEGREDO_SMTP), 'o valor do segredo vazou no diff');
    assert.ok(!bruto.includes('antiga-123'), 'o valor ANTERIOR do segredo vazou no diff');
    assert.ok(!bruto.includes(SEGREDO_WPP), 'o token do WhatsApp vazou no diff');
  });

  await test('calcularDiff: segredo que NAO mudou nao gera linha nenhuma', async () => {
    assert.ok(configDiff, 'services/almoxarifado/configDiff.js nao existe');
    const d = configDiff.calcularDiff({ alertas_smtp_pass: 'x' }, { alertas_smtp_pass: 'x' });
    assert.deepStrictEqual(d.novos, {});
  });

  // ── RN-04: PUT /configuracoes ───────────────────────────────────────────────────────────
  await test('RN-04: 18 chaves com UMA alterada gera UMA linha com UMA chave no de/para', async () => {
    const base = await payloadDaTela();
    const antes = await contarConfig();
    const anterior = base.alerta_lote_vencendo_dias;
    const novo = String(Number(anterior) + 5);
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ ...base, alerta_lote_vencendo_dias: novo });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const depois = await contarConfig();
    assert.strictEqual(depois - antes, 1, `esperava 1 linha de auditoria, vieram ${depois - antes}`);
    const linha = await ultimaConfig();
    assert.strictEqual(linha.entidade_id, null, 'entidade_id e INTEGER e a chave e TEXT — tem de ser null');
    assert.strictEqual(linha.usuario_id, 7);
    const dn = JSON.parse(linha.dados_novos);
    const da = JSON.parse(linha.dados_anteriores);
    assert.deepStrictEqual(Object.keys(dn), ['alerta_lote_vencendo_dias'],
      `o log trouxe chaves que nao mudaram: ${Object.keys(dn).join(', ')}`);
    assert.strictEqual(dn.alerta_lote_vencendo_dias, novo);
    assert.strictEqual(da.alerta_lote_vencendo_dias, anterior);
  });

  await test('RN-04: PUT das MESMAS 18 chaves sem alteracao nenhuma gera ZERO linhas', async () => {
    const base = await payloadDaTela();
    const antes = await contarConfig();
    const res = await request(app).put('/api/almoxarifado/configuracoes').send(base);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depois = await contarConfig();
    assert.strictEqual(depois, antes, `save sem mudanca criou ${depois - antes} linha(s) de ruido`);
  });

  await test('dados_novos guarda o que foi de FATO escrito na coluna (String(valor))', async () => {
    // A rota persiste String(valor). Logar o valor cru do body faria um `null` do payload
    // virar `null` no log e a string 'null' na coluna — numa etapa cujo tema e o log nao
    // mentir, seria o proprio defeito.
    const base = await payloadDaTela();
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ ...base, notificacoes_dest_entradas: 'diretoria@gmp.com' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linha = await ultimaConfig();
    const dn = JSON.parse(linha.dados_novos);
    const col = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'notificacoes_dest_entradas'");
    assert.strictEqual(dn.notificacoes_dest_entradas, col.valor,
      'o log diz uma coisa e a coluna guarda outra');
  });

  // ── RN-05: segredo nas configuracoes de alertas ─────────────────────────────────────────
  const bodyAlertas = (over = {}) => ({
    emails: ['alertas@gmp.com'],
    whatsappNumeros: [],
    notificarEmail: true,
    notificarWhatsapp: false,
    intervaloVerificacaoHoras: 4,
    debounceSegundos: 60,
    smtpHost: 'smtp.gmp.com',
    smtpPort: 587,
    smtpUser: 'alertas@gmp.com',
    smtpFrom: 'alertas@gmp.com',
    smtpSecure: false,
    whatsappWebhookUrl: '',
    appUrl: 'https://systemgmp.online',
    requisicoesEmails: [],
    comprasEmails: [],
    requisicoesNotificarEmail: true,
    requisicoesLembreteAtivo: true,
    requisicoesLembreteIntervaloHoras: 24,
    ...over,
  });

  await test('alertas-estoque: o primeiro save audita o diff das chaves que mudaram', async () => {
    const antes = await contarConfig();
    const res = await request(app).put('/api/almoxarifado/configuracoes/alertas-estoque')
      .send(bodyAlertas());
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await contarConfig()) - antes, 1, 'esperava exatamente 1 linha por PUT');
    const dn = JSON.parse((await ultimaConfig()).dados_novos);
    assert.strictEqual(dn.alertas_smtp_host, 'smtp.gmp.com', 'o host que mudou nao entrou no log');
  });

  await test('alertas-estoque: repetir o MESMO save nao gera linha (zero mudancas)', async () => {
    const antes = await contarConfig();
    const res = await request(app).put('/api/almoxarifado/configuracoes/alertas-estoque')
      .send(bodyAlertas());
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await contarConfig(), antes, 'save identico criou linha de ruido');
  });

  await test('RN-05: mudar o segredo audita "(alterado)" e o VALOR nunca aparece no log', async () => {
    const antes = await contarConfig();
    const res = await request(app).put('/api/almoxarifado/configuracoes/alertas-estoque')
      .send(bodyAlertas({ smtpPass: SEGREDO_SMTP, whatsappApiKey: SEGREDO_WPP }));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await contarConfig()) - antes, 1);

    const linha = await ultimaConfig();
    const dn = JSON.parse(linha.dados_novos);
    assert.strictEqual(dn.alertas_smtp_pass, '(alterado)',
      `esperava a mascara, veio ${JSON.stringify(dn.alertas_smtp_pass)}`);
    assert.strictEqual(dn.alertas_whatsapp_api_key, '(alterado)');

    // O segredo foi mesmo gravado (senao a mascara estaria "protegendo" um no-op).
    const col = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'alertas_smtp_pass'");
    assert.strictEqual(col.valor, SEGREDO_SMTP, 'a rota nem gravou o segredo — o cenario nao exercitou nada');

    // Asserção NEGATIVA sobre o texto CRU de TODAS as linhas de configuracao: e a coluna que
    // vaza, nao o objeto ja parseado.
    const todas = await linhasDe('configuracao', 'EDICAO');
    const bruto = todas.map(r => `${r.dados_anteriores || ''}${r.dados_novos || ''}`).join('\n');
    assert.ok(!bruto.includes(SEGREDO_SMTP), 'a SENHA SMTP vazou para o log de auditoria');
    assert.ok(!bruto.includes(SEGREDO_WPP), 'o TOKEN do WhatsApp vazou para o log de auditoria');
  });

  // ── liberacao-valor ─────────────────────────────────────────────────────────────────────
  await test('liberacao-valor: o save audita o de/para na forma PERSISTIDA', async () => {
    const antes = await contarConfig();
    const res = await request(app).put('/api/almoxarifado/configuracoes/liberacao-valor')
      .send({ ativo: true, limite: 1000, aprovadorIds: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await contarConfig()) - antes, 1);
    const linha = await ultimaConfig();
    const dn = JSON.parse(linha.dados_novos);
    const da = JSON.parse(linha.dados_anteriores);
    assert.strictEqual(da.liberacao_valor_ativo, '0');
    assert.strictEqual(dn.liberacao_valor_ativo, '1');
    assert.strictEqual(da.liberacao_valor_limite, '500');
    assert.strictEqual(dn.liberacao_valor_limite, '1000');
    // `aprovadores`/`souAprovador` sao do getConfigForApi, NAO da forma persistida: se o diff
    // comparar o retorno do saveConfig contra o getConfig, elas aparecem aqui como "mudanca".
    assert.ok(!('aprovadores' in dn), 'vazou chave do getConfigForApi (shape errado nos dois lados do diff)');
    assert.ok(!('souAprovador' in dn), 'vazou chave do getConfigForApi (shape errado nos dois lados do diff)');
  });

  await test('liberacao-valor: repetir o MESMO save nao gera linha', async () => {
    const antes = await contarConfig();
    const res = await request(app).put('/api/almoxarifado/configuracoes/liberacao-valor')
      .send({ ativo: true, limite: 1000, aprovadorIds: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await contarConfig(), antes,
      'save identico criou linha — sinal de shape diferente entre os dois lados do diff');
  });

  // ── RN-06: lotes de material ────────────────────────────────────────────────────────────
  const novoMaterial = async (codigo, campos = {}) => {
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima,
         ponto_pedido, prazo_reposicao_dias, ativo)
       VALUES (?,?,'UN',?,?,?,?,?,1)`,
      [codigo, `Material ${codigo}`, 10,
        campos.quantidade_minima ?? 1, campos.quantidade_maxima ?? 10,
        campos.ponto_pedido ?? 2, campos.prazo_reposicao_dias ?? 5]);
    return r.lastID;
  };

  await test('RN-06: 3 materiais no lote, 2 alterados -> 2 linhas material/ATUALIZACAO', async () => {
    const a = await novoMaterial(`E19-A-${Date.now()}`);
    const b = await novoMaterial(`E19-B-${Date.now()}`);
    const c = await novoMaterial(`E19-C-${Date.now()}`);

    const res = await request(app).put('/api/almoxarifado/configuracoes/estoques-minimos').send({
      materiais: [
        { id: a, quantidade_minima: 50, quantidade_maxima: 10, ponto_pedido: 2, prazo_reposicao_dias: 5 },
        { id: b, quantidade_minima: 1, quantidade_maxima: 10, ponto_pedido: 2, prazo_reposicao_dias: 5 },
        { id: c, quantidade_minima: 1, quantidade_maxima: 10, ponto_pedido: 2, prazo_reposicao_dias: 99 },
      ],
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhasA = await linhasDe('material', 'ATUALIZACAO', a);
    const linhasB = await linhasDe('material', 'ATUALIZACAO', b);
    const linhasC = await linhasDe('material', 'ATUALIZACAO', c);
    assert.strictEqual(linhasA.length, 1, 'o material que MUDOU nao deixou rastro');
    assert.strictEqual(linhasB.length, 0, 'material inalterado gerou linha — a auditoria e por request, nao por mudanca');
    assert.strictEqual(linhasC.length, 1, 'o material que MUDOU nao deixou rastro');

    const daA = JSON.parse(linhasA[0].dados_anteriores);
    const dnA = JSON.parse(linhasA[0].dados_novos);
    assert.deepStrictEqual(Object.keys(dnA), ['quantidade_minima'],
      `campos que nao mudaram entraram no log: ${Object.keys(dnA).join(', ')}`);
    assert.strictEqual(Number(daA.quantidade_minima), 1);
    assert.strictEqual(Number(dnA.quantidade_minima), 50);

    const dnC = JSON.parse(linhasC[0].dados_novos);
    assert.deepStrictEqual(Object.keys(dnC), ['prazo_reposicao_dias']);
    assert.strictEqual(Number(dnC.prazo_reposicao_dias), 99);
  });

  await test('RN-06: id inexistente no lote nao inventa linha de auditoria', async () => {
    const antes = (await linhasDe('material', 'ATUALIZACAO')).length;
    const res = await request(app).put('/api/almoxarifado/configuracoes/estoques-minimos')
      .send({ materiais: [{ id: 999999, quantidade_minima: 7 }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual((await linhasDe('material', 'ATUALIZACAO')).length, antes,
      'auditou um material que nao existe');
  });

  await test('lote de tipos-material tambem audita por material alterado', async () => {
    const tipo = await dbRun(db,
      `INSERT INTO tipos_material_almoxarifado (nome, ativo) VALUES (?,1)`, [`E19 Tipo ${Date.now()}`]);
    const m = await novoMaterial(`E19-T-${Date.now()}`);
    const res = await request(app).put('/api/almoxarifado/configuracoes/tipos-material')
      .send({ materiais: [{ id: m, tipo_material_id: tipo.lastID }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('material', 'ATUALIZACAO', m);
    assert.strictEqual(linhas.length, 1);
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(Number(dn.tipo_material_id), tipo.lastID);

    // repetir o mesmo lote nao pode gerar segunda linha
    await request(app).put('/api/almoxarifado/configuracoes/tipos-material')
      .send({ materiais: [{ id: m, tipo_material_id: tipo.lastID }] });
    assert.strictEqual((await linhasDe('material', 'ATUALIZACAO', m)).length, 1,
      'lote identico auditou de novo');
  });

  // ── RN-02: auditoria quebrada NAO derruba o ato ─────────────────────────────────────────
  await test('RN-02: registrarAuditoria explodindo nao derruba o PUT /configuracoes', async () => {
    const base = await payloadDaTela();
    const antes = await contarConfig();
    const alvo = String(Number(base.alerta_calibracao_dias) + 3);

    const original = auditModule.registrarAuditoria;
    let chamado = false;
    auditModule.registrarAuditoria = async () => {
      chamado = true;
      throw new Error('SABOTAGEM: auditoria explodiu');
    };
    try {
      const res = await request(app).put('/api/almoxarifado/configuracoes')
        .send({ ...base, alerta_calibracao_dias: alvo });
      // (1) o stub TEM de ter sido alcancado — sem isto, uma rota que simplesmente NAO
      //     auditasse passaria verde e este teste seria vazio.
      assert.ok(chamado, 'o stub sabotado nao foi alcancado: ou a rota nao audita, ou audita '
        + 'pelo binding desestruturado (import por objeto e o que torna o stub alcancavel)');
      // (2) o ato responde normal e GRAVOU
      assert.strictEqual(res.status, 200, `auditoria derrubou o ato: ${JSON.stringify(res.body)}`);
      const col = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'alerta_calibracao_dias'");
      assert.strictEqual(col.valor, alvo, 'a configuracao nao foi gravada');
    } finally {
      auditModule.registrarAuditoria = original;
    }
    // (3) nenhuma linha nasceu
    assert.strictEqual(await contarConfig(), antes, 'a auditoria sabotada gravou linha assim mesmo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
