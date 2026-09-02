/**
 * Etapa 20, Task 2 (C3 + C4) — segredo no GET e no PUT genérico de configurações.
 *
 * O DEFEITO: `GET /api/almoxarifado/configuracoes` devolvia a tabela inteira em claro, inclusive
 * `alertas_smtp_pass` e `alertas_whatsapp_api_key`, enquanto a rota IRMÃ de alertas
 * (`GET /configuracoes/alertas-estoque`) já mascarava as duas com `PASSWORD_MASK`. E o
 * `PUT /configuracoes` genérico aceitava essas mesmas chaves (são semeadas) SEM o
 * `shouldUpdateSecret` que a rota de alertas usa — ou seja, mascarar só o GET deixaria a porta
 * meio fechada: quem lesse `'********'` na tela e reenviasse gravaria a MÁSCARA como senha.
 *
 * O QUE ESTE ARQUIVO PROVA:
 * - RN-05: as 2 chaves secretas saem como `'********'` quando há valor e `''` quando não há —
 *   idêntico ao que `getAlertSettingsForApi` já devolve. Asserção NEGATIVA sobre o corpo CRU.
 * - RN-06: o PUT genérico recusa as 2 chaves com 400 ANTES de qualquer UPDATE, e a coluna fica
 *   intacta (nem a secreta, nem as demais chaves do mesmo lote).
 *
 * ANTI-TESTE-VAZIO (achado A3 da revisão do plano). A asserção negativa da RN-05 só vale se o
 * segredo estiver MESMO na coluna. Gravá-lo pelo caminho óbvio — o PUT genérico — daria 400
 * depois do C4, a coluna ficaria `''` (é a semente, `schema.js:1799-1803`) e o teste passaria
 * provando ZERO: `''` nunca apareceria no corpo de qualquer jeito. Por isso todo cenário grava
 * pela rota `PUT /configuracoes/alertas-estoque` e ASSERE A COLUNA ANTES de olhar o GET (molde:
 * `auditoriaConfiguracoes.api.test.js:281-282`). Idem RN-06: valor não-vazio na coluna ANTES do
 * 400, senão "coluna intacta" compara `''` com `''`.
 *
 * DECISÃO CONGELADA AQUI (achado A5): `alertas_whatsapp_webhook_url` fica FORA da máscara. A
 * rota irmã devolve o webhook em claro sob o MESMO gate, então mascarar num dos dois GETs não
 * reduz exposição nenhuma; mascarar o GET sem guardar o PUT criaria o pior caso (reenviar a
 * máscara mataria as notificações em silêncio); e o registro permanente — o log — já mascara a
 * query string desde a Etapa 19. Há cenário explícito abaixo travando isso, para que uma
 * "melhoria" futura tenha de derrubar um teste que diz o porquê.
 *
 * Harness: `denyUnlessAlmoxAdmin` NÃO aceita `role:'admin'` puro — o usuário precisa de
 * `is_superadmin` ou `perfil_almoxarifado: 'ADMINISTRADOR'`, senão TODO cenário levaria 403 e
 * o arquivo inteiro seria vazio.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbAll, dbRun } = require('../../services/almoxarifado/db');
const alertService = require('../../services/almoxarifado/alertService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN_ALMOX = { id: 1, nome: 'Admin Almox', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' };

const MASCARA = '********';
const SEGREDO_SMTP = 'senha-SMTP-do-teste-9X7-naovaza';
const SEGREDO_WPP = 'token-WhatsApp-do-teste-4K2-naovaza';
const CHAVES_SECRETAS = ['alertas_smtp_pass', 'alertas_whatsapp_api_key'];
const WEBHOOK = 'https://api.zap.example/send?token=TOKEN-NA-URL-DO-TESTE';

// As 18 chaves da aba "Configurações Gerais" (client/.../ConfiguracoesAlmoxarifado.js, CAMPOS).
// Estão aqui para provar que a máscara NÃO encostou em nenhuma delas.
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
  const { app, db, close } = await createTestApp({ user: ADMIN_ALMOX });

  const getConfigs = async () => {
    const res = await request(app).get('/api/almoxarifado/configuracoes');
    assert.strictEqual(res.status, 200, `GET /configuracoes recusado: ${JSON.stringify(res.body)}`);
    return res;
  };
  const coluna = async (chave) => {
    const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
    return row ? row.valor : undefined;
  };
  // Grava os segredos pela ÚNICA rota que pode gravá-los depois do C4. O corpo mínimo que a
  // rota de alertas aceita — ela normaliza tudo o que faltar.
  const gravarSegredos = async (extra = {}) => {
    const res = await request(app).put('/api/almoxarifado/configuracoes/alertas-estoque')
      .send({ smtpPass: SEGREDO_SMTP, whatsappApiKey: SEGREDO_WPP, whatsappWebhookUrl: WEBHOOK, ...extra });
    assert.strictEqual(res.status, 200, `PUT alertas-estoque recusado: ${JSON.stringify(res.body)}`);
    return res;
  };

  // ── Guardas anti-teste-vazio ────────────────────────────────────────────────────────────
  await test('[guarda] o usuario do teste passa por canConfigureAlmox no GET e no PUT', async () => {
    const get = await getConfigs();
    assert.ok(!Array.isArray(get.body), 'a forma do GET virou array — a tela le Object.entries');
    const put = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ aprovacao_automatica: '0' });
    assert.strictEqual(put.status, 200, `PUT recusado (${put.status}): ${JSON.stringify(put.body)} `
      + '— se for 403, o harness nao passa pelo gate e TODO cenario abaixo provaria nada');
  });

  await test('[guarda] as chaves secretas e as 18 da tela existem semeadas', async () => {
    assert.strictEqual(CHAVES_TELA.length, 18, 'a lista deixou de refletir as 18 chaves da tela');
    const body = (await getConfigs()).body;
    for (const chave of [...CHAVES_SECRETAS, ...CHAVES_TELA, 'alertas_whatsapp_webhook_url']) {
      assert.ok(body[chave], `a chave '${chave}' nao esta semeada — o cenario que a usa seria vazio`);
    }
    assert.strictEqual(alertService.PASSWORD_MASK, MASCARA,
      'PASSWORD_MASK mudou de forma; a mascara do GET generico deve seguir a da rota irma');
  });

  // ── RN-05 ───────────────────────────────────────────────────────────────────────────────
  // Este cenário roda ANTES de qualquer gravação: a semente é '' e a máscara não pode MENTIR
  // "há senha configurada" quando não há (é o que a tela lê para decidir o placeholder).
  await test('[RN-05] sem valor na coluna, o GET devolve \'\' — a mascara nao inventa segredo', async () => {
    for (const chave of CHAVES_SECRETAS) {
      assert.strictEqual(await coluna(chave), '', `pre-condicao quebrada: '${chave}' ja tem valor`);
    }
    const body = (await getConfigs()).body;
    for (const chave of CHAVES_SECRETAS) {
      assert.strictEqual(body[chave].valor, '',
        `'${chave}' esta vazia na coluna e o GET devolveu ${JSON.stringify(body[chave].valor)}`);
    }
  });

  await test('[RN-05] com valor na coluna, o GET devolve a mascara e NUNCA o segredo', async () => {
    await gravarSegredos();
    // A coluna PRIMEIRO (achado A3): sem isto, a asserção negativa abaixo seria sobre um
    // segredo que nunca foi gravado — passaria verde provando zero.
    assert.strictEqual(await coluna('alertas_smtp_pass'), SEGREDO_SMTP,
      'a rota de alertas nem gravou a senha — o cenario nao exercitou nada');
    assert.strictEqual(await coluna('alertas_whatsapp_api_key'), SEGREDO_WPP,
      'a rota de alertas nem gravou o token — o cenario nao exercitou nada');

    const res = await getConfigs();
    assert.strictEqual(res.body.alertas_smtp_pass.valor, MASCARA,
      `a SENHA SMTP saiu do GET generico como ${JSON.stringify(res.body.alertas_smtp_pass.valor)}`);
    assert.strictEqual(res.body.alertas_whatsapp_api_key.valor, MASCARA,
      `o TOKEN do WhatsApp saiu do GET generico como ${JSON.stringify(res.body.alertas_whatsapp_api_key.valor)}`);

    // Asserção NEGATIVA sobre o corpo CRU: é o texto da resposta que vaza, não o objeto já lido
    // chave a chave (uma chave nova amanhã carregando o mesmo valor passaria despercebida).
    const bruto = JSON.stringify(res.body);
    assert.ok(!bruto.includes(SEGREDO_SMTP), 'a SENHA SMTP vazou no corpo do GET /configuracoes');
    assert.ok(!bruto.includes(SEGREDO_WPP), 'o TOKEN do WhatsApp vazou no corpo do GET /configuracoes');
  });

  await test('[RN-05] a mascara e do GET, nao do dado: a coluna continua com o segredo real', async () => {
    await getConfigs();
    assert.strictEqual(await coluna('alertas_smtp_pass'), SEGREDO_SMTP,
      'ler mascarado alterou a coluna — a mascara vazou para a persistencia');
    assert.strictEqual(await coluna('alertas_whatsapp_api_key'), SEGREDO_WPP);
  });

  await test('[RN-05] a mascara NAO encosta nas 18 chaves da tela, nem em descricao/id', async () => {
    const body = (await getConfigs()).body;
    const linhas = await dbAll(db, 'SELECT chave, valor, descricao, id FROM configuracoes_almoxarifado');
    assert.ok(linhas.length >= 20, `poucas linhas semeadas (${linhas.length}) — banco do teste vazio?`);
    assert.strictEqual(Object.keys(body).length, linhas.length,
      'o GET passou a omitir (ou inventar) chave — a mascara so pode trocar o VALOR');

    let conferidas = 0;
    for (const linha of linhas) {
      const item = body[linha.chave];
      assert.ok(item, `o GET deixou de devolver '${linha.chave}'`);
      assert.strictEqual(item.descricao, linha.descricao, `descricao de '${linha.chave}' mudou`);
      assert.strictEqual(item.id, linha.id, `id de '${linha.chave}' mudou`);
      if (CHAVES_SECRETAS.includes(linha.chave)) continue;
      assert.strictEqual(item.valor, linha.valor,
        `'${linha.chave}' NAO e secreta e saiu diferente da coluna: ${JSON.stringify(item.valor)}`);
      conferidas++;
    }
    assert.ok(conferidas >= 18, `so ${conferidas} chaves nao-secretas conferidas — laco vazio`);
    for (const chave of CHAVES_TELA) {
      assert.notStrictEqual(body[chave].valor, MASCARA,
        `a chave de TELA '${chave}' foi mascarada — a tela reenviaria '********' como valor`);
    }
  });

  await test('[C3/A5] o webhook do WhatsApp FICA EM CLARO no GET, de proposito', async () => {
    // Decisão registrada: a rota irmã já devolve o webhook em claro sob o mesmo gate, e mascarar
    // aqui sem guardar o PUT faria quem reenviasse gravar a máscara como URL e matar as
    // notificações em silêncio. Quem quiser mudar isto tem de derrubar este teste e ler o porquê.
    assert.strictEqual(await coluna('alertas_whatsapp_webhook_url'), WEBHOOK, 'pre-condicao quebrada');
    const body = (await getConfigs()).body;
    assert.strictEqual(body.alertas_whatsapp_webhook_url.valor, WEBHOOK,
      'o webhook foi mascarado no GET — ver a decisao A5 no cabecalho deste arquivo');
  });

  // ── RN-06 ───────────────────────────────────────────────────────────────────────────────
  for (const chave of CHAVES_SECRETAS) {
    await test(`[RN-06] o PUT generico recusa '${chave}' com 400 e a coluna fica intacta`, async () => {
      const antes = await coluna(chave);
      assert.ok(antes && antes.length > 0,
        `'${chave}' esta VAZIA antes do PUT — "coluna intacta" compararia '' com '' e provaria zero`);
      const res = await request(app).put('/api/almoxarifado/configuracoes')
        .send({ [chave]: 'MASCARA-REENVIADA-PELA-TELA' });
      assert.strictEqual(res.status, 400, `o PUT generico ACEITOU o segredo: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.error,
        `Configuração "${chave}" só pode ser alterada em Configurações → Alertas de Estoque`,
        `mensagem divergente: ${JSON.stringify(res.body.error)}`);
      assert.strictEqual(await coluna(chave), antes, `'${chave}' foi gravada apesar do 400`);
    });
  }

  await test('[RN-06] a recusa vem ANTES de qualquer UPDATE — nenhuma chave do lote e gravada', async () => {
    // Sem transação, recusar no MEIO do laço deixaria metade do formulário aplicada. A guarda
    // mora junto das de prefixo, no laço de validação que roda inteiro antes do de UPDATE.
    await request(app).put('/api/almoxarifado/configuracoes').send({ aprovacao_automatica: '0' });
    assert.strictEqual(await coluna('aprovacao_automatica'), '0', 'pre-condicao quebrada');
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ aprovacao_automatica: '1', alertas_smtp_pass: 'x' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await coluna('aprovacao_automatica'), '0',
      'a chave inocente do MESMO lote foi gravada antes da recusa — meia gravacao');
    assert.strictEqual(await coluna('alertas_smtp_pass'), SEGREDO_SMTP);
  });

  await test('[RN-06] chave secreta com valor VAZIO tambem e recusada (nao ha "apagar por atalho")', async () => {
    const res = await request(app).put('/api/almoxarifado/configuracoes').send({ alertas_smtp_pass: '' });
    assert.strictEqual(res.status, 400, `string vazia passou pela guarda: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await coluna('alertas_smtp_pass'), SEGREDO_SMTP, 'a senha foi APAGADA pelo PUT generico');
  });

  // ── Compatibilidade: o que NÃO pode ter mudado ──────────────────────────────────────────
  await test('[compat] o PUT generico continua aceitando a URL do webhook INTEIRA (200)', async () => {
    // Espelha `auditoriaConfiguracoes.api.test.js:426-453`, que exige 200 aqui. Se a máscara
    // tivesse pego o webhook junto, a guarda do C4 teria de pegar também e aquele teste cairia.
    const url = 'https://api.zap.example/send?token=OUTRO-TOKEN-NA-URL';
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ alertas_whatsapp_webhook_url: url });
    assert.strictEqual(res.status, 200, `o PUT do webhook virou ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await coluna('alertas_whatsapp_webhook_url'), url,
      'a URL nao foi persistida inteira — o webhook aponta para lugar nenhum');
    await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = 'alertas_whatsapp_webhook_url'", [WEBHOOK]);
  });

  await test('[compat] a rota de alertas continua mascarando e o shouldUpdateSecret continua valendo', async () => {
    const get = await request(app).get('/api/almoxarifado/configuracoes/alertas-estoque');
    assert.strictEqual(get.status, 200, JSON.stringify(get.body));
    assert.strictEqual(get.body.smtpPass, MASCARA, 'a rota irma deixou de mascarar a senha');
    assert.strictEqual(get.body.whatsappApiKey, MASCARA, 'a rota irma deixou de mascarar o token');

    // Reenviar a máscara pela rota de alertas NÃO grava — é o `shouldUpdateSecret`. É o único
    // caminho que a tela tem para salvar as outras opções sem destruir a senha.
    const put = await request(app).put('/api/almoxarifado/configuracoes/alertas-estoque')
      .send({ smtpPass: MASCARA, whatsappApiKey: MASCARA, whatsappWebhookUrl: WEBHOOK });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(await coluna('alertas_smtp_pass'), SEGREDO_SMTP,
      'reenviar a mascara pela rota de alertas GRAVOU \'********\' como senha');
    assert.strictEqual(await coluna('alertas_whatsapp_api_key'), SEGREDO_WPP,
      'reenviar a mascara pela rota de alertas GRAVOU \'********\' como token');

    // E o ciclo completo: GET genérico → reenviar pela rota certa → a senha continua a real.
    const depois = (await getConfigs()).body;
    assert.strictEqual(depois.alertas_smtp_pass.valor, MASCARA);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
