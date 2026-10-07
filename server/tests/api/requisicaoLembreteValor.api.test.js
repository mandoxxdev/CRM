/**
 * Etapa 47, T1 — o lembrete alcança a requisição travada por LIBERAÇÃO DE VALOR.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras.md (T1)
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md
 *
 * ── O QUE FALTAVA, E NÃO É O QUE A SPEC 06 DIZIA ────────────────────────────────────────────
 * A spec 06 registra, desde 2026-08-29, que "a requisicao que mais precisa de cobranca e a unica
 * que fica sem ela". A Fase 1 mediu e a frase EXAGERA: `notificarAprovadoresValor` existe e sai no
 * instante em que a requisicao entra em `AGUARDANDO_APROVACAO_VALOR`. O que falta e a COBRANCA DE
 * PERMANENCIA — o aviso sai uma vez e nunca repete, e o lembrete diario filtra `status =
 * 'PENDENTE'`, que nao alcanca esse estado.
 *
 * ── AS QUATRO CORREÇÕES QUE A FASE 2 IMPÔS A ESTA TASK ──────────────────────────────────────
 *  1. `getEmailsAprovadores` NAO estava exportado. Sem isso, `resolverDestinatarios` lancaria, e
 *     como `processarLembretesPendentes` NAO TINHA try/catch por requisicao, UMA requisicao ruim
 *     abortaria o lote inteiro — matando o lembrete de todas as PENDENTE posteriores, de hora em
 *     hora, em silencio. O cenario (8) prende isso.
 *  2. `AGUARDANDO_APROVACAO_VALOR` tem DUAS procedencias. A de NASCIMENTO (a requisicao ja nasce
 *     travada) e a que esta task cobre. A de DESCARRILAMENTO — requisicao JA APROVADA que cai nesse
 *     status quando alguem liga a liberacao por valor depois, por UPDATE cru que nem passa pela
 *     maquina de estados — fica FORA, porque nela a requisicao tem reserva viva e `diasAguardando`
 *     contaria do descarrilamento. Regua: `data_aprovacao IS NULL`. Cenario (2).
 *  3. O limite vem de `getReminderSettings`, e nao de dentro de `buildMensagemLembrete`: ela e
 *     SINCRONA e EXPORTADA, e mudar a assinatura dela quebraria chamador de fora.
 *  4. A literal NAO repete o "R$": `formatMoeda` ja o emite. A versao do desenho sairia
 *     "Valor total: R$ R$ 900,00".
 *
 * ── A METADE POSITIVA QUE EU TINHA ESCRITO NAO PROVAVA NADA ─────────────────────────────────
 * Eu havia escrito "requisicao PENDENTE continua entrando" como prova de nao ter quebrado a lane
 * boa. A Fase 2 mediu: uma requisicao PENDENTE **nunca tem `aprovador_id`** (ele so e escrito por
 * rotas que tiram o status de PENDENTE), entao o ramo que eu dizia preservar e INALCANCAVEL. A
 * metade positiva real sao os ENDERECOS EXATOS das duas plateias — cenarios (4) e (5).
 *
 * ⚠️ E O CENARIO TEM DE LIGAR A CONFIG: na configuracao de fabrica
 * (`liberacao_valor_aprovadores = '[]'`) `getEmailsAprovadores` cai na lista geral, que e a MESMA
 * plateia de PENDENTE — a regra seria um no-op e o teste nao distinguiria nada. Por isso o (4)
 * cadastra um aprovador cujo e-mail NAO esta na lista geral.
 *
 * Executar: cd server && node tests/api/requisicaoLembreteValor.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reminder = require('../../services/almoxarifado/requisitionReminderService');
const valueSvc = require('../../services/almoxarifado/requisitionValueApprovalService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 47 T1: o lembrete alcanca a requisicao travada por valor ===\n');
  const { db, close } = await createTestApp({ user: { id: 1, nome: 'Admin', role: 'admin' } });

  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  // A tabela `usuarios` e do NUCLEO e nao entra no schema do almoxarifado — o harness nao a cria.
  // Mesmo molde de `server/tests/almoxarifado.test.js:79-81`, que a cria minima para os cenarios de
  // liberacao por valor. Sem ela, `getAprovadoresDetalhes` nao resolve e-mail de aprovador nenhum.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1
  )`);
  const criarUsuario = async (nome, email) => (await dbRun(db,
    'INSERT INTO usuarios (nome, email, ativo) VALUES (?,?,1)', [nome, email])).lastID;

  const criarMaterial = async () => (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, custo_unitario, ativo)
     VALUES (?,?,'UN',100,50,1)`, [uniq('MAT-E47'), 'Rolamento E47'])).lastID;

  /**
   * Uma requisição no status pedido, com a maturação pedida.
   * `dataAprovacao` distingue as DUAS procedências do `AGUARDANDO_APROVACAO_VALOR` (correção 2).
   */
  async function novaRequisicao({
    status = 'PENDENTE', updatedOffset = '-30 hours', ultimoLembrete = null,
    valorTotal = null, dataAprovacao = null, solicitanteId = 1,
  } = {}) {
    const materialId = await criarMaterial();
    const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, setor, status, valor_total,
       data_aprovacao, updated_at, ultimo_lembrete_enviado)
      VALUES (?,?,?,?,?,?,?, datetime('now', ?), ${ultimoLembrete ? `datetime('now', '${ultimoLembrete}')` : 'NULL'})`,
      [uniq('REQ-E47'), solicitanteId, 'Solicitante E47', 'Produção', status, valorTotal,
        dataAprovacao, updatedOffset]);
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
      VALUES (?,?,3)`, [r.lastID, materialId]);
    return dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [r.lastID]);
  }

  const elegiveis = async () => reminder.buscarRequisicoesElegiveis(db, 24);
  const entra = async (id) => (await elegiveis()).some((r) => r.id === id);

  const destinatariosDe = async (req) => {
    const settings = await reminder.getReminderSettings(db);
    return reminder.resolverDestinatarios(db, req, settings);
  };

  // A lista geral do lembrete e a lista de aprovadores de valor sao DIFERENTES de propósito nestes
  // cenários — é a única forma de o teste distinguir as duas plateias (ver o ⚠️ do cabeçalho).
  const EMAIL_GERAL = 'compras.geral@test.com';
  const EMAIL_APROVADOR = 'diretor.financeiro@test.com';

  await setConfig('requisicoes_lembrete_ativo', '1');
  await setConfig('requisicoes_lembrete_intervalo_horas', '24');
  await setConfig('requisicoes_notificar_emails', JSON.stringify([EMAIL_GERAL]));
  await setConfig('liberacao_valor_limite', '500');

  // ── (1) a (3): a elegibilidade, e as DUAS procedências ─────────────────────────────────────
  await test('(1) requisicao travada por valor, madura e SEM aprovacao, ENTRA na elegibilidade', async () => {
    const req = await novaRequisicao({ status: 'AGUARDANDO_APROVACAO_VALOR', valorTotal: 900 });
    assert.strictEqual(await entra(req.id), true,
      'a requisicao de alto valor continua invisivel para o lembrete');
  });

  await test('(2) a procedencia de DESCARRILAMENTO (ja aprovada) NAO entra', async () => {
    // Requisição que JÁ foi aprovada e caiu no status depois, porque alguém ligou a liberação por
    // valor. Ela tem `data_aprovacao` e reserva viva; cobrá-la seria mentir duas vezes — a frase
    // diria "aguardando" e o `diasAguardando` contaria do descarrilamento, não do pedido.
    const req = await novaRequisicao({
      status: 'AGUARDANDO_APROVACAO_VALOR', valorTotal: 900,
      dataAprovacao: '2026-09-01 10:00:00',
    });
    assert.strictEqual(await entra(req.id), false,
      'o lembrete cobrou uma requisicao JA APROVADA — a literal dele mente nesse caminho');

    // Metade POSITIVA no mesmo cenário: a irmã sem `data_aprovacao` entra. Sem ela, este teste
    // passaria com uma régua que excluísse o status inteiro.
    const irma = await novaRequisicao({ status: 'AGUARDANDO_APROVACAO_VALOR', valorTotal: 900 });
    assert.strictEqual(await entra(irma.id), true, 'a regua excluiu o status inteiro');
  });

  await test('(3) PENDENTE continua entrando, e a maturacao/reincidencia valem nos DOIS status', async () => {
    const pendente = await novaRequisicao({ status: 'PENDENTE' });
    assert.strictEqual(await entra(pendente.id), true, 'a lane PENDENTE parou de entrar');

    // Maturação: nova demais não entra — nos dois status.
    const novaP = await novaRequisicao({ status: 'PENDENTE', updatedOffset: '-2 hours' });
    const novaV = await novaRequisicao({ status: 'AGUARDANDO_APROVACAO_VALOR', updatedOffset: '-2 hours', valorTotal: 900 });
    assert.strictEqual(await entra(novaP.id), false, 'PENDENTE nova demais entrou');
    assert.strictEqual(await entra(novaV.id), false, 'travada por valor nova demais entrou');

    // Reincidência: lembrada agora não repete — nos dois status.
    const lembradaP = await novaRequisicao({ status: 'PENDENTE', ultimoLembrete: '-2 hours' });
    const lembradaV = await novaRequisicao({
      status: 'AGUARDANDO_APROVACAO_VALOR', ultimoLembrete: '-2 hours', valorTotal: 900,
    });
    assert.strictEqual(await entra(lembradaP.id), false, 'PENDENTE reincidiu antes do intervalo');
    assert.strictEqual(await entra(lembradaV.id), false, 'travada por valor reincidiu antes do intervalo');
  });

  // ── (4) e (5): as plateias, por ENDEREÇO EXATO ─────────────────────────────────────────────
  await test('(4) a plateia do status novo e a dos APROVADORES DE VALOR, e nao a lista geral', async () => {
    const aprovadorId = await criarUsuario('Diretor Financeiro', EMAIL_APROVADOR);
    await setConfig('liberacao_valor_ativo', '1');
    await setConfig('liberacao_valor_aprovadores', JSON.stringify([aprovadorId]));

    const req = await novaRequisicao({ status: 'AGUARDANDO_APROVACAO_VALOR', valorTotal: 900 });
    const destinos = await destinatariosDe(req);

    assert.deepStrictEqual(destinos, [EMAIL_APROVADOR],
      `a plateia do status novo veio ${JSON.stringify(destinos)} — tinha de ser so o aprovador de valor`);
    assert.ok(!destinos.includes(EMAIL_GERAL),
      'a lista geral entrou na plateia da liberacao por valor');
  });

  await test('(5) a plateia de PENDENTE continua sendo a lista geral — e isso e endereco, nao contagem', async () => {
    const req = await novaRequisicao({ status: 'PENDENTE' });
    const destinos = await destinatariosDe(req);
    assert.deepStrictEqual(destinos, [EMAIL_GERAL],
      `a plateia de PENDENTE veio ${JSON.stringify(destinos)}`);
    assert.ok(!destinos.includes(EMAIL_APROVADOR),
      'o aprovador de valor passou a receber lembrete de requisicao comum');
  });

  // ── (6) e (7): a mensagem ──────────────────────────────────────────────────────────────────
  await test('(6) a mensagem do status novo fala de LIBERACAO POR VALOR, com o valor e o limite', async () => {
    const settings = await reminder.getReminderSettings(db);
    const req = {
      id: 1, numero: 'REQ-777', status: 'AGUARDANDO_APROVACAO_VALOR',
      solicitante_nome: 'João', setor: 'Caldeiraria', urgencia: 'NORMAL',
      valor_total: 900,
      updated_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    };
    const msg = reminder.buildMensagemLembrete(req, [{
      material_nome: 'Rolamento', material_codigo: 'ROL-1', quantidade_solicitada: 3, unidade: 'UN',
    }], 2, 'https://systemgmp.online', settings);

    assert.ok(msg.assunto.includes('REQ-777'), 'o assunto perdeu o numero');
    assert.ok(/libera[çc][ãa]o por valor/i.test(msg.assunto),
      `o assunto nao fala de liberacao por valor: ${msg.assunto}`);
    assert.ok(!/aguardando aprova[çc][ãa]o/i.test(msg.assunto),
      'o assunto do status novo usa a frase da lane normal');

    // O valor e o limite, que sao o numero que EXPLICA por que a requisicao parou.
    assert.ok(msg.text.includes('900,00'), `o corpo nao traz o valor: ${msg.text.slice(0, 400)}`);
    assert.ok(msg.text.includes('500,00'), 'o corpo nao traz o limite');
    // ⚠️ E o "R$" NAO pode aparecer dobrado: `formatMoeda` ja o emite.
    assert.ok(!/R\$\s*R\$/.test(msg.text), `"R$" dobrado no texto: ${msg.text.slice(0, 400)}`);
    assert.ok(!/R\$\s*R\$/.test(msg.html), '"R$" dobrado no HTML');
  });

  await test('(7) a mensagem de PENDENTE nao mudou — e nao ganhou linha de valor', async () => {
    const settings = await reminder.getReminderSettings(db);
    const req = {
      id: 2, numero: 'REQ-888', status: 'PENDENTE',
      solicitante_nome: 'Maria', setor: 'Montagem', urgencia: 'NORMAL',
      updated_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    };
    const msg = reminder.buildMensagemLembrete(req, [{
      material_nome: 'Parafuso', material_codigo: 'PAR-8', quantidade_solicitada: 10, unidade: 'UN',
    }], 2, 'https://systemgmp.online', settings);

    assert.ok(/aguardando aprova[çc][ãa]o/i.test(msg.assunto),
      `a lane normal perdeu a frase dela: ${msg.assunto}`);
    assert.ok(!/libera[çc][ãa]o por valor/i.test(msg.assunto),
      'a lane normal passou a falar de liberacao por valor');
    assert.ok(!msg.text.includes('limite'), 'a lane normal ganhou a linha do limite');
  });

  // ── (8) o lote não morre por causa de uma requisição ───────────────────────────────────────
  await test('(8) um erro numa requisicao NAO aborta o lote — e as outras sao processadas', async () => {
    // ⚠️ ESTE CENARIO NASCEU DA FASE 2. `processarLembretesPendentes` nao tinha try/catch por
    // requisicao: uma que lancasse abortava o `for`, e como a busca ordena `updated_at ASC`, UMA
    // requisicao antiga mataria o lembrete de todas as posteriores — de hora em hora, em silencio,
    // porque o job engole no console.warn. Era o que a T1 causaria com o export que faltava.
    // A ANTIGA e a do status novo, e vem PRIMEIRO na fila (ORDER BY updated_at ASC) — e ela que
    // lanca. A POSTERIOR e PENDENTE: se o lote abortar, ela nao e processada.
    const antiga = await novaRequisicao({ status: 'AGUARDANDO_APROVACAO_VALOR', updatedOffset: '-90 hours', valorTotal: 900 });
    const nova = await novaRequisicao({ status: 'PENDENTE', updatedOffset: '-30 hours' });

    // ⚠️ O PATCH É EM `valueSvc.getEmailsAprovadores`, e a escolha é o ponto do cenário.
    //
    // A primeira versão deste teste patcheava `reminder.processarLembreteRequisicao` — e era um
    // TESTE VAZIO: `processarLembretesPendentes` chama a função LOCAL, não a propriedade do módulo,
    // então o patch nunca pegava e o cenário passava verde com o defeito vivo. É o quinto caso
    // documentado dessa forma nesta base.
    //
    // `getEmailsAprovadores` é chamada ATRAVESSANDO a fronteira de módulo
    // (`valueSvc.getEmailsAprovadores(...)`), então o patch pega — e ele reproduz EXATAMENTE o modo
    // de falha que a Fase 2 mediu: a resolução de destinatário do status novo lançando, com a
    // requisição mais antiga na frente da fila.
    const original = valueSvc.getEmailsAprovadores;
    valueSvc.getEmailsAprovadores = async () => { throw new Error('falha proposital na resolucao'); };
    try {
      const r = await reminder.processarLembretesPendentes(db);
      const ids = r.resultados.map((x) => x.requisicao_id);
      assert.ok(ids.includes(nova.id),
        'a requisicao POSTERIOR nao foi processada — uma requisicao ruim abortou o lote');
      const daAntiga = r.resultados.find((x) => x.requisicao_id === antiga.id);
      assert.ok(daAntiga, 'a requisicao que falhou sumiu do resultado em vez de aparecer com erro');
      assert.strictEqual(daAntiga.enviado, false);
    } finally {
      valueSvc.getEmailsAprovadores = original;
    }
  });

  // ── (9) o log registra a cobrança do status novo, para a plateia certa ─────────────────────
  await test('(9) o log grava a tentativa do status novo, com dias_aguardando e o aprovador de valor', async () => {
    // Sem SMTP no harness o envio falha — e a falha TAMBÉM tem de ficar no log, é o que o
    // almoxarife consulta para saber se a cobrança saiu.
    const req = await novaRequisicao({ status: 'AGUARDANDO_APROVACAO_VALOR', updatedOffset: '-50 hours', valorTotal: 900 });
    const settings = await reminder.getReminderSettings(db);
    await reminder.processarLembreteRequisicao(db, req, settings);
    const logs = await dbAll(db,
      'SELECT destinatario, dias_aguardando FROM requisicao_lembretes_log WHERE requisicao_id = ?', [req.id]);
    assert.deepStrictEqual(logs.map((l) => l.destinatario), [EMAIL_APROVADOR],
      `o log registrou ${JSON.stringify(logs)}`);
    assert.strictEqual(logs[0].dias_aguardando, 3, 'dias_aguardando nao contou da criacao (50h = 3 dias)');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
