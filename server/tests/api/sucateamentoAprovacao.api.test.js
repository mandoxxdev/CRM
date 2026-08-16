/**
 * Etapa 9, Task 6 — dupla aprovacao segregada e a baixa emitida na SEGUNDA assinatura.
 *
 * Este e o arquivo dos dois testes que a spec 15 nomeia:
 *   - "sucatear sem aprovacao falha" — e a leitura forte, nao a fraca: nao basta a rota generica
 *     recusar `SUCATA` (Task 5 fez isso, e `sucataDedicada.api.test.js` prova). UMA perna assinada
 *     tambem NAO baixa. Enquanto so uma perna assinou, o estoque nao se move e o status continua
 *     SOLICITADO.
 *   - "material sucateado fora do disponivel" — a pre-checagem esta em `sucateamento.api.test.js`
 *     (solicitacao); AQUI o mesmo caso e provado no ponto onde ele custa caro: o saldo que existia
 *     na solicitacao pode ter sumido quando a segunda assinatura chega, e e o MOTOR que recusa.
 *
 * ── POR QUE A COMPENSACAO E METADE DESTE ARQUIVO ─────────────────────────────────────────────
 *
 * O modulo NAO TEM TRANSACAO (ver o cabecalho de returnService e a decisao 15 da Etapa 9). O claim
 * da segunda assinatura e um UPDATE, e a baixa e outro. Entre os dois, o motor pode recusar — e ai
 * a solicitacao ficaria APROVADA, com as duas pernas assinadas, SEM baixa nenhuma: o pior estado
 * possivel, porque `registrarDestino` passaria a aceitar declarar a venda de um material que
 * continua na prateleira.
 *
 * A INJECAO E NATURAL, sem mock nenhum: consumir o saldo por uma `SAIDA` normal entre a
 * solicitacao e a segunda assinatura. Ela so funciona porque o servico NAO pre-checa o disponivel
 * antes do claim na aprovacao — e isso e decisao, nao esquecimento (ver o docstring de
 * `aprovar` em scrapDisposalService.js): uma segunda copia da conta do disponivel ali seria uma
 * segunda fonte da mesma regra E nao removeria a necessidade da compensacao, porque a janela entre
 * a pre-checagem e o motor e exatamente a corrida que a compensacao existe para cobrir.
 *
 * SE ESTE TESTE COMECAR A FALHAR porque alguem passou a pre-checar o disponivel antes do claim: a
 * correcao NAO e apagar as assercoes de compensacao (elas passariam a ser vacuas — o status nunca
 * teria saido de SOLICITADO, provando nada). E achar outra falha natural do motor depois do claim.
 *
 * Executar: cd server && node tests/api/sucateamentoAprovacao.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const scrapDisposalService = require('../../services/almoxarifado/scrapDisposalService');
const stockService = require('../../services/almoxarifado/stockService');
const sm = require('../../services/almoxarifado/scrapDisposalStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Ana Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 3, nome: 'Gil Gestor', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 4, nome: 'Pedro Producao', perfil_almoxarifado: 'PRODUCAO' };
const ALMOXARIFE2 = { id: 5, nome: 'Bia Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const ADMIN2 = { id: 6, nome: 'Outro Admin', role: 'admin' };
// Solicitante que TAMBEM poderia assinar: e o unico jeito de provar que a barreira do solicitante
// e por IDENTIDADE, e nao um efeito colateral de PRODUCAO nao ter permissao nenhuma.
const ALMOXARIFE_SOLICITANTE = { id: 7, nome: 'Caio Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };

let seq = 0;
async function novoMaterial(db, { atual = 100, controle_lote = 0 } = {}) {
  seq += 1;
  const codigo = `SUCA-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, controle_lote, tipo_material, ativo)
    VALUES (?,?,'UN',?,?,'ACO',1)`, [codigo, `Material aprovacao ${seq}`, atual, controle_lote]);
  return { id: r.lastID, codigo };
}

const atualDe = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

const linha = async (db, id) => dbGet(db, 'SELECT * FROM sucateamentos_almoxarifado WHERE id = ?', [id]);

const sucatasDe = async (db, materialId) => dbAll(db,
  "SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SUCATA' ORDER BY id", [materialId]);

const logDe = async (db, id) => dbAll(db,
  "SELECT * FROM auditoria_log_almoxarifado WHERE entidade='sucateamento' AND entidade_id=? ORDER BY id", [id]);

const JUST = 'chapa oxidada no patio, sem recuperacao';

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  async function solicitar(material, extra = {}, quem = PRODUCAO) {
    return scrapDisposalService.solicitar(db, quem, {
      material_id: material.id, quantidade: 40, justificativa: JUST, ...extra });
  }

  // ── A maquina de estados ────────────────────────────────────────────────────────────────────
  await test('[maquina] os estados e as transicoes sao os do design (decisao 9)', async () => {
    assert.deepStrictEqual(sm.STATUS_SUCATEAMENTO,
      ['SOLICITADO', 'APROVADO', 'VENDIDA', 'DESCARTADA', 'REJEITADO', 'CANCELADO']);
    assert.deepStrictEqual(sm.TRANSICOES.SOLICITADO, ['APROVADO', 'REJEITADO', 'CANCELADO']);
    assert.deepStrictEqual(sm.TRANSICOES.APROVADO, ['VENDIDA', 'DESCARTADA']);
    for (const final of ['VENDIDA', 'DESCARTADA', 'REJEITADO', 'CANCELADO']) {
      assert.deepStrictEqual(sm.TRANSICOES[final], [], `${final} deveria ser estado final`);
    }
  });

  await test('[maquina] validarTransicao NOMEIA o estado atual e os permitidos', async () => {
    const ok = sm.validarTransicao('SOLICITADO', 'APROVADO');
    assert.strictEqual(ok.ok, true);
    const nao = sm.validarTransicao('APROVADO', 'CANCELADO');
    assert.strictEqual(nao.ok, false);
    assert.ok(/APROVADO/.test(nao.erro), `a mensagem nao nomeia o estado atual: ${nao.erro}`);
    assert.ok(/VENDIDA/.test(nao.erro) && /DESCARTADA/.test(nao.erro),
      `a mensagem nao lista os permitidos: ${nao.erro}`);
    const doFinal = sm.validarTransicao('VENDIDA', 'APROVADO');
    assert.ok(/estado final/i.test(doFinal.erro), `estado final sem saida nao foi explicado: ${doFinal.erro}`);
  });

  // ── "sucatear sem aprovacao falha": UMA perna nao baixa ─────────────────────────────────────
  await test('sucatear sem aprovacao falha: uma perna assinada NAO baixa nada', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);

    const r = await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'SOLICITADO', 'uma assinatura so ja mudou o status para APROVADO');
    assert.strictEqual(row.aprovador_almox_id, ALMOXARIFE.id, 'a perna assinada nao ficou registrada');
    assert.strictEqual(row.aprovador_almox_nome, ALMOXARIFE.nome);
    assert.ok(row.aprovado_almox_em, 'nao gravou quando a perna foi assinada');
    assert.strictEqual(row.aprovador_gestao_id, null);
    assert.strictEqual(row.movimentacao_sucata_id, null, 'emitiu a baixa com UMA assinatura');
    assert.strictEqual(r.baixa_emitida, false, 'o retorno afirma ter emitido baixa com uma assinatura');

    assert.strictEqual(await atualDe(db, m.id), 100, 'o estoque caiu com uma assinatura so');
    assert.strictEqual((await sucatasDe(db, m.id)).length, 0, 'lancou SUCATA no livro com uma assinatura so');
  });

  await test('a segunda assinatura (usuario distinto) APROVA e emite a baixa SUCATA pelo motor', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    const r = await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');

    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'APROVADO', 'as duas assinaturas nao levaram a APROVADO');
    assert.strictEqual(row.aprovador_gestao_id, GESTOR.id);
    assert.ok(row.aprovado_gestao_em);
    assert.ok(row.movimentacao_sucata_id, 'nao gravou a movimentacao da baixa na linha');
    assert.strictEqual(r.baixa_emitida, true);

    assert.strictEqual(await atualDe(db, m.id), 60, 'a baixa nao saiu do estoque');
    const sucatas = await sucatasDe(db, m.id);
    assert.strictEqual(sucatas.length, 1, `esperava 1 lancamento SUCATA, achou ${sucatas.length}`);
    assert.strictEqual(sucatas[0].id, row.movimentacao_sucata_id, 'o id gravado nao e o do lancamento');
    assert.strictEqual(sucatas[0].quantidade, 40);
    // A justificativa da SOLICITACAO e a que vai para o livro: o motor exige justificativa em
    // SUCATA (movementRules), e inventar uma aqui apagaria o que o solicitante escreveu.
    assert.ok(sucatas[0].justificativa.includes(JUST),
      `o livro nao carrega a justificativa da solicitacao: ${sucatas[0].justificativa}`);
  });

  await test('a ordem das pernas nao importa: gestao primeiro tambem fecha', async () => {
    // O CASE do claim e espelhado nas duas pernas. Sem este teste, um espelho errado (a perna
    // gestao olhando a propria coluna em vez da outra) so apareceria em producao.
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');
    assert.strictEqual((await linha(db, s.id)).status, 'SOLICITADO', 'a perna de gestao sozinha aprovou');
    assert.strictEqual(await atualDe(db, m.id), 100, 'a perna de gestao sozinha baixou');

    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    assert.strictEqual((await linha(db, s.id)).status, 'APROVADO');
    assert.strictEqual(await atualDe(db, m.id), 60);
  });

  // ── SEGREGACAO ──────────────────────────────────────────────────────────────────────────────
  await test('o solicitante nao aprova nenhuma perna — mesmo tendo o perfil para isso', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m, {}, ALMOXARIFE_SOLICITANTE);
    await assert.rejects(
      () => scrapDisposalService.aprovar(db, ALMOXARIFE_SOLICITANTE, s.id, 'almoxarifado'),
      (e) => {
        assert.ok(/solicit/i.test(e.message), `a recusa nao explica a segregacao: ${e.message}`);
        assert.strictEqual(e.status, 403);
        return true;
      });
    // A perna de gestao tambem: o solicitante nao assina NENHUMA.
    const solicitanteGestor = { ...ALMOXARIFE_SOLICITANTE, perfil_almoxarifado: 'GESTOR' };
    await assert.rejects(
      () => scrapDisposalService.aprovar(db, solicitanteGestor, s.id, 'gestao'), /solicit/i);
    const row = await linha(db, s.id);
    assert.strictEqual(row.aprovador_almox_id, null, 'assinou mesmo recusando');
    assert.strictEqual(row.aprovador_gestao_id, null);
    assert.strictEqual(await atualDe(db, m.id), 100);
  });

  await test('o MESMO usuario nao assina as duas pernas (ADMINISTRADOR inclusive)', async () => {
    // O ADMINISTRADOR pode as duas acoes — e e exatamente por isso que ele e o caso perigoso:
    // sem esta barreira, "dupla aprovacao" seria uma assinatura com dois carimbos.
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ADMIN, s.id, 'almoxarifado');
    await assert.rejects(
      () => scrapDisposalService.aprovar(db, ADMIN, s.id, 'gestao'),
      (e) => {
        assert.ok(/mesma pessoa|mesmo usuario|outra perna|ja assinou/i.test(e.message),
          `a recusa nao explica que ele ja assinou a outra perna: ${e.message}`);
        assert.strictEqual(e.status, 403);
        return true;
      });

    // ESTAS sao as assercoes que a SABOTAGEM (a) tem de derrubar: sem a checagem, a segunda
    // assinatura do mesmo usuario completaria o processo e BAIXARIA o estoque.
    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'SOLICITADO', 'o mesmo usuario fechou as duas pernas');
    assert.strictEqual(row.aprovador_gestao_id, null, 'gravou a segunda perna no mesmo usuario');
    assert.strictEqual(row.movimentacao_sucata_id, null, 'emitiu baixa com uma pessoa so');
    assert.strictEqual(await atualDe(db, m.id), 100, 'o estoque caiu com uma pessoa so assinando as duas pernas');
    assert.strictEqual((await sucatasDe(db, m.id)).length, 0);
  });

  await test('[CONTROLE POSITIVO] OUTRO administrador fecha a segunda perna', async () => {
    // Sem este controle, uma barreira escrita larga demais ("ADMINISTRADOR nunca assina a segunda
    // perna") passaria no teste acima e travaria o caso legitimo — dois administradores distintos.
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ADMIN, s.id, 'almoxarifado');
    await scrapDisposalService.aprovar(db, ADMIN2, s.id, 'gestao');
    assert.strictEqual((await linha(db, s.id)).status, 'APROVADO');
    assert.strictEqual(await atualDe(db, m.id), 60);
  });

  // ── Permissao por perfil (gate REAL de permissions.can) ─────────────────────────────────────
  await test('[permissao] perfil sem a acao da perna e recusado com 403', async () => {
    // A rota so chega na Task 7; a decisao de QUEM assina cada perna e do servico e usa o `can`
    // real. Nao e checagem duplicada da rota: a perna determina a ACAO (aprovar_sucateamento vs
    // aprovar_sucateamento_gestao), e essa e uma propriedade da PERNA, nao da URL.
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    for (const [quem, perna] of [[PRODUCAO, 'almoxarifado'], [PRODUCAO, 'gestao'],
      [GESTOR, 'almoxarifado'], [ALMOXARIFE, 'gestao']]) {
      await assert.rejects(
        () => scrapDisposalService.aprovar(db, quem, s.id, perna),
        (e) => {
          assert.strictEqual(e.status, 403, `${quem.nome} na perna ${perna} nao deu 403`);
          assert.ok(/permiss/i.test(e.message), `a recusa nao fala de permissao: ${e.message}`);
          return true;
        }, `${quem.perfil_almoxarifado} assinou a perna ${perna}`);
    }
    const row = await linha(db, s.id);
    assert.strictEqual(row.aprovador_almox_id, null);
    assert.strictEqual(row.aprovador_gestao_id, null);
  });

  await test('perna desconhecida e recusada (nome de perna errado nao pode virar no-op)', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await assert.rejects(
      () => scrapDisposalService.aprovar(db, ADMIN, s.id, 'financeiro'), /perna/i);
  });

  // ── Corrida no claim ────────────────────────────────────────────────────────────────────────
  await test('aprovar uma perna JA assinada devolve 409, mesmo por outro usuario habilitado', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    await assert.rejects(
      () => scrapDisposalService.aprovar(db, ALMOXARIFE2, s.id, 'almoxarifado'),
      (e) => {
        assert.strictEqual(e.status, 409, `esperava 409 na perna ja assinada, veio ${e.status}`);
        assert.ok(/j[aá] (foi )?aprovada|j[aá] assinada|n[aã]o est[aá] mais/i.test(e.message),
          `o 409 nao explica o que aconteceu: ${e.message}`);
        return true;
      });
    const row = await linha(db, s.id);
    assert.strictEqual(row.aprovador_almox_id, ALMOXARIFE.id, 'a segunda tentativa sobrescreveu o assinante');
    assert.strictEqual(row.status, 'SOLICITADO');
  });

  await test('aprovar em status final cai na maquina de estados, nomeando o estado', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.cancelar(db, PRODUCAO, s.id);
    await assert.rejects(
      () => scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado'),
      (e) => {
        assert.ok(/CANCELADO/.test(e.message), `a recusa nao nomeia o estado atual: ${e.message}`);
        return true;
      });
  });

  // ── Lote e a baixa ──────────────────────────────────────────────────────────────────────────
  await test('material com controle_lote: a baixa da 2a assinatura CITA o lote no livro', async () => {
    const m = await novoMaterial(db, { atual: 0, controle_lote: 1 });
    const lote = (await dbRun(db,
      "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?,?,'ATIVO')",
      [m.id, `CORRIDA-${seq}`])).lastID;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 100 WHERE id = ?', [m.id]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade)
      VALUES (?,NULL,?,?)`, [m.id, lote, 100]);

    const s = await solicitar(m, { lote_id: lote });
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');

    const row = await linha(db, s.id);
    const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [row.movimentacao_sucata_id]);
    assert.strictEqual(mov.lote_id, lote, 'a baixa SUCATA nao citou o lote no livro');
    assert.strictEqual(await atualDe(db, m.id), 60);
  });

  // ── COMPENSACAO: a razao de existir da metade deste arquivo ─────────────────────────────────
  await test('saldo consumido entre a solicitacao e a 2a assinatura: o motor recusa E o claim volta', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m); // 40, com 100 disponiveis
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');

    // A INJECAO NATURAL: uma saida normal leva o saldo para 20. Nada de mock.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m.id, tipo: 'SAIDA', quantidade: 80, justificativa: 'entrega para a producao' });
    assert.strictEqual(await atualDe(db, m.id), 20);

    await assert.rejects(
      () => scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao'),
      (e) => {
        // O erro do MOTOR chega inteiro a quem chamou: "Saldo insuficiente. Disponível: 20 UN" e o
        // que diz o que corrigir. Trocar por um generico transformaria erro acionavel em adivinhacao.
        assert.ok(/saldo/i.test(e.message), `a recusa nao e a do motor: ${e.message}`);
        return true;
      },
      'a 2a assinatura baixou 40 de um saldo de 20');

    // ESTAS sao as assercoes que a SABOTAGEM (b) tem de derrubar.
    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'SOLICITADO',
      'o claim nao foi compensado: a solicitacao ficou APROVADA sem baixa nenhuma');
    assert.strictEqual(row.aprovador_gestao_id, null, 'a perna recem-assinada nao foi limpa');
    assert.strictEqual(row.aprovador_gestao_nome, null);
    assert.strictEqual(row.aprovado_gestao_em, null);
    // A OUTRA perna PERMANECE: ela foi assinada antes e nada aconteceu com ela.
    assert.strictEqual(row.aprovador_almox_id, ALMOXARIFE.id,
      'a compensacao apagou a perna que ja estava assinada antes');
    assert.strictEqual(row.movimentacao_sucata_id, null);
    assert.strictEqual((await sucatasDe(db, m.id)).length, 0, 'deixou lancamento SUCATA de uma baixa recusada');
    assert.strictEqual(await atualDe(db, m.id), 20, 'mexeu no estoque apesar da recusa');

    // A compensacao fica AUDITADA: sem isso, "por que esta solicitacao voltou para SOLICITADO?"
    // nao tem resposta em lugar nenhum.
    const log = await logDe(db, s.id);
    const comp = log.find((l) => /compensacao/i.test(l.acao));
    assert.ok(comp, 'a compensacao do claim nao deixou linha de auditoria');
    assert.ok(/saldo/i.test(comp.justificativa || ''),
      `a auditoria da compensacao nao guarda o erro do motor: ${comp.justificativa}`);

    // CONTROLE POSITIVO DA COMPENSACAO: a solicitacao continua VIVA e assinavel. Se a compensacao
    // tivesse deixado a linha num estado morto, este segundo ciclo falharia.
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: m.id, tipo: 'ENTRADA', quantidade: 100, justificativa: 'reposicao' });
    await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');
    const depois = await linha(db, s.id);
    assert.strictEqual(depois.status, 'APROVADO', 'a solicitacao compensada nao pode mais ser aprovada');
    assert.ok(depois.movimentacao_sucata_id);
    assert.strictEqual(await atualDe(db, m.id), 80, '120 - 40 = 80: a baixa do segundo ciclo nao saiu');
  });

  // ── Rejeitar ────────────────────────────────────────────────────────────────────────────────
  await test('rejeitar com motivo leva a REJEITADO, sem baixa, e audita', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.rejeitar(db, GESTOR, s.id, 'a chapa ainda da para reaproveitar em suporte');
    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'REJEITADO');
    assert.strictEqual(row.rejeitado_por_id, GESTOR.id);
    assert.strictEqual(row.rejeitado_por_nome, GESTOR.nome);
    assert.ok(row.rejeitado_em);
    assert.ok(/reaproveitar/.test(row.motivo_rejeicao), 'nao gravou o motivo da rejeicao');
    assert.strictEqual(await atualDe(db, m.id), 100, 'rejeitar baixou estoque');
    assert.ok((await logDe(db, s.id)).some((l) => l.acao === 'rejeitar'), 'nao auditou a rejeicao');
  });

  await test('rejeitar sem motivo e recusado; quem nao aprova NENHUMA perna tambem e', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await assert.rejects(() => scrapDisposalService.rejeitar(db, GESTOR, s.id, '   '), /motivo/i);
    await assert.rejects(
      () => scrapDisposalService.rejeitar(db, PRODUCAO, s.id, 'nao quero'),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await linha(db, s.id)).status, 'SOLICITADO');
    // CONTROLE POSITIVO: quem aprova QUALQUER uma das duas pernas rejeita.
    await scrapDisposalService.rejeitar(db, ALMOXARIFE, s.id, 'material ainda util');
    assert.strictEqual((await linha(db, s.id)).status, 'REJEITADO');
  });

  await test('rejeitar depois de APROVADO e recusado (a baixa ja aconteceu)', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');
    await assert.rejects(
      () => scrapDisposalService.rejeitar(db, GESTOR, s.id, 'mudei de ideia'),
      /APROVADO/);
    assert.strictEqual((await linha(db, s.id)).status, 'APROVADO');
  });

  // ── Destino final ───────────────────────────────────────────────────────────────────────────
  async function aprovada(qtdMaterial = 100) {
    const m = await novoMaterial(db, { atual: qtdMaterial });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');
    return { m, s };
  }

  await test('registrarDestino VENDIDA exige valor_venda > 0 e grava quem declarou', async () => {
    const { s } = await aprovada();
    await assert.rejects(
      () => scrapDisposalService.registrarDestino(db, ALMOXARIFE, s.id, { destino: 'VENDIDA' }),
      /valor/i);
    await assert.rejects(
      () => scrapDisposalService.registrarDestino(db, ALMOXARIFE, s.id, { destino: 'VENDIDA', valor_venda: 0 }),
      /valor/i);
    assert.strictEqual((await linha(db, s.id)).status, 'APROVADO', 'mudou o status mesmo recusando');

    await scrapDisposalService.registrarDestino(db, ALMOXARIFE, s.id, {
      destino: 'VENDIDA', valor_venda: 850.75, comprovante_arquivo: 'uploads/nf-sucata.pdf' });
    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'VENDIDA');
    assert.strictEqual(row.valor_venda, 850.75);
    assert.strictEqual(row.comprovante_arquivo, 'uploads/nf-sucata.pdf');
    assert.strictEqual(row.destino_registrado_por_id, ALMOXARIFE.id);
    assert.strictEqual(row.destino_registrado_por_nome, ALMOXARIFE.nome);
    assert.ok(row.destino_registrado_em);
    assert.ok((await logDe(db, s.id)).some((l) => l.acao === 'registrar_destino'), 'nao auditou o destino');
  });

  await test('registrarDestino DESCARTADA nao exige valor; e o segundo registro cai no claim', async () => {
    const { s } = await aprovada();
    await scrapDisposalService.registrarDestino(db, GESTOR, s.id, { destino: 'DESCARTADA' });
    assert.strictEqual((await linha(db, s.id)).status, 'DESCARTADA');
    // Claim `WHERE status='APROVADO'`: o segundo registro nao reescreve um destino ja declarado.
    await assert.rejects(
      () => scrapDisposalService.registrarDestino(db, GESTOR, s.id, { destino: 'VENDIDA', valor_venda: 10 }),
      /DESCARTADA/);
  });

  await test('registrarDestino antes da 2a assinatura e recusado — declarar venda do que nao foi baixado', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    await assert.rejects(
      () => scrapDisposalService.registrarDestino(db, GESTOR, s.id, { destino: 'DESCARTADA' }),
      /SOLICITADO/);
    assert.strictEqual(await atualDe(db, m.id), 100);
  });

  await test('registrarDestino exige perfil que aprova alguma perna (o valor de venda e financeiro)', async () => {
    const { s } = await aprovada();
    await assert.rejects(
      () => scrapDisposalService.registrarDestino(db, PRODUCAO, s.id, { destino: 'DESCARTADA' }),
      (e) => { assert.strictEqual(e.status, 403); return true; });
    assert.strictEqual((await linha(db, s.id)).status, 'APROVADO');
  });

  // ── Auditoria das duas assinaturas ──────────────────────────────────────────────────────────
  await test('cada assinatura deixa a sua linha de auditoria, nomeando a perna', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await solicitar(m);
    await scrapDisposalService.aprovar(db, ALMOXARIFE, s.id, 'almoxarifado');
    await scrapDisposalService.aprovar(db, GESTOR, s.id, 'gestao');
    const aprovacoes = (await logDe(db, s.id)).filter((l) => l.acao === 'aprovar');
    assert.strictEqual(aprovacoes.length, 2, `esperava 2 auditorias de aprovacao, achou ${aprovacoes.length}`);
    const pernas = aprovacoes.map((l) => JSON.parse(l.dados_novos).perna).sort();
    assert.deepStrictEqual(pernas, ['almoxarifado', 'gestao'], 'a auditoria nao nomeia a perna assinada');
    const usuarios = aprovacoes.map((l) => l.usuario_id).sort();
    assert.deepStrictEqual(usuarios, [ALMOXARIFE.id, GESTOR.id].sort());
    const fechou = aprovacoes.find((l) => JSON.parse(l.dados_novos).baixa_emitida === true);
    assert.ok(fechou, 'nenhuma auditoria registra qual assinatura emitiu a baixa');
    assert.ok(JSON.parse(fechou.dados_novos).movimentacao_sucata_id, 'a auditoria da baixa nao cita a movimentacao');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
