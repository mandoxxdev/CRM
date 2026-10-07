/**
 * Etapa 47, T5 — o lembrete POR PENDÊNCIA de regra.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras.md (T5)
 * Design: seções 7.2 e 8.2 — "a liberação por valor NÃO é regra"; o lembrete de regra é OUTRO
 *         lembrete, dirigido por pendência, e quem cobra NUNCA lê o status para decidir a plateia.
 *
 * Os cenários passam pelo caminho REAL do job (`processarLembretesPendentes`), com
 * `alertService.enviarEmail` substituído por um coletor — o reminder chama pela propriedade do
 * módulo, então o patch pega (conferido pela sabotagem S-envio no plano).
 *
 * A costura com a T1, e a escolha feita: enquanto há pendência de regra ABERTA, `/aprovar` e
 * `/aprovar-valor` estão barrados — o lembrete POR STATUS cobraria de quem não pode agir. A
 * requisição sai da lane de status e é cobrada só pela de pendência (cenário 6). Reversível.
 *
 * Executar: cd server && node tests/api/lembreteRegra.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const reminder = require('../../services/almoxarifado/requisitionReminderService');
const alertService = require('../../services/almoxarifado/alertService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 47 T5: lembrete por pendencia de regra ===\n');
  const { db, close } = await createTestApp({ user: { id: 1, nome: 'Admin', role: 'admin' } });

  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  const EMAIL_GERAL = 'geral@test.com';
  await setConfig('requisicoes_lembrete_ativo', '1');
  await setConfig('requisicoes_lembrete_intervalo_horas', '24');
  await setConfig('requisicoes_notificar_emails', JSON.stringify([EMAIL_GERAL]));

  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)`);
  const U = { solic: 10, ana: 11, bia: 12, caio: 13 };
  for (const [nome, id] of Object.entries(U)) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)',
      [id, nome, `${nome}@test.com`]);
  }

  const materialId = (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, custo_unitario, ativo) VALUES (?,?,'UN',100,10,1)`,
  [uniq('MAT-T5'), 'Material T5'])).lastID;

  async function novaRequisicao({ status = 'PENDENTE', updatedOffset = '-30 hours' } = {}) {
    const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, setor, status, updated_at, regras_avaliadas_em)
      VALUES (?,?,?,?,?, datetime('now', ?), CURRENT_TIMESTAMP)`,
    [uniq('REQ-T5'), U.solic, 'Solic', 'Produção', status, updatedOffset]);
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,2)',
      [r.lastID, materialId]);
    return dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [r.lastID]);
  }
  let regraSeq = 0;
  async function novaPendencia(reqId, {
    aprovadores, nome = `Regra ${++regraSeq}`, status = 'ABERTA', criadaOffset = '-30 hours',
    aprovadorId = null, ultimoLembrete = null,
  }) {
    const regraId = (await dbRun(db, `INSERT INTO regras_aprovacao (nome, valor_minimo, aprovadores)
      VALUES (?, 1, ?)`, [nome, JSON.stringify(aprovadores)])).lastID;
    const p = await dbRun(db, `INSERT INTO requisicao_aprovacoes_regra
      (requisicao_id, regra_id, regra_nome, aprovadores, status, aprovador_id, created_at, ultimo_lembrete_enviado)
      VALUES (?,?,?,?,?,?, datetime('now', ?), ${ultimoLembrete ? `datetime('now', '${ultimoLembrete}')` : 'NULL'})`,
    [reqId, regraId, nome, JSON.stringify(aprovadores), status, aprovadorId, criadaOffset]);
    return dbGet(db, 'SELECT * FROM requisicao_aprovacoes_regra WHERE id = ?', [p.lastID]);
  }

  // O coletor: o caminho real do job até a porta do SMTP.
  let enviados = [];
  const enviarOriginal = alertService.enviarEmail;
  alertService.enviarEmail = async (_db, destinatarios, assunto, html, text) => {
    enviados.push({ destinatarios: [...destinatarios].sort(), assunto, html, text });
    return { enviados: destinatarios.length, erros: [] };
  };
  const rodar = async () => { enviados = []; return reminder.processarLembretesPendentes(db); };
  const doAssunto = (trecho) => enviados.filter((e) => e.assunto.includes(trecho));

  await test('(1) pendencia aberta e madura e cobrada — nova demais, ja lembrada, e de requisicao morta, nao', async () => {
    const req = await novaRequisicao();
    const madura = await novaPendencia(req.id, { aprovadores: [U.ana], nome: 'Regra Madura' });
    const req2 = await novaRequisicao();
    await novaPendencia(req2.id, { aprovadores: [U.ana], nome: 'Regra Nova', criadaOffset: '-2 hours' });
    const req3 = await novaRequisicao();
    await novaPendencia(req3.id, { aprovadores: [U.ana], nome: 'Regra Lembrada', ultimoLembrete: '-2 hours' });
    const req4 = await novaRequisicao({ status: 'REJEITADO' });
    await novaPendencia(req4.id, { aprovadores: [U.ana], nome: 'Regra Morta' });
    const req5 = await novaRequisicao();
    await novaPendencia(req5.id, { aprovadores: [U.ana], nome: 'Regra Obsoleta', status: 'OBSOLETA' });

    const r = await rodar();
    assert.ok(r.lembretes_regra, 'o resultado do job nao traz a lane de regra');
    assert.strictEqual(doAssunto('Regra Madura').length, 1, 'a pendencia madura nao foi cobrada');
    for (const nome of ['Regra Nova', 'Regra Lembrada', 'Regra Morta', 'Regra Obsoleta']) {
      assert.strictEqual(doAssunto(nome).length, 0, `${nome} foi cobrada`);
    }
    const marcada = await dbGet(db, 'SELECT ultimo_lembrete_enviado FROM requisicao_aprovacoes_regra WHERE id = ?', [madura.id]);
    assert.ok(marcada.ultimo_lembrete_enviado, 'a reincidencia nao foi marcada depois do envio');

    await rodar();
    assert.strictEqual(doAssunto('Regra Madura').length, 0, 'reincidiu antes do intervalo');
  });

  await test('(2) a plateia e o snapshot da pendencia MENOS o solicitante e quem ja assinou outra perna', async () => {
    const req = await novaRequisicao();
    // Caio já assinou a outra perna desta requisição: não pode assinar esta — cobrar dele é ruído.
    await novaPendencia(req.id, { aprovadores: [U.caio], nome: 'Regra Assinada', status: 'APROVADA', aprovadorId: U.caio });
    await novaPendencia(req.id, { aprovadores: [U.ana, U.solic, U.caio], nome: 'Regra Plateia' });
    await rodar();
    const [e] = doAssunto('Regra Plateia');
    assert.ok(e, 'a pendencia nao foi cobrada');
    assert.deepStrictEqual(e.destinatarios, ['ana@test.com'],
      `a plateia veio ${JSON.stringify(e.destinatarios)}`);
  });

  await test('(3) sem ninguem na lista que possa assinar, cai na lista geral', async () => {
    const req = await novaRequisicao();
    await novaPendencia(req.id, { aprovadores: [U.solic], nome: 'Regra So Solicitante' });
    await rodar();
    const [e] = doAssunto('Regra So Solicitante');
    assert.ok(e, 'a pendencia sem plateia nao foi cobrada de ninguem');
    assert.deepStrictEqual(e.destinatarios, [EMAIL_GERAL]);
  });

  await test('(4) a mensagem nomeia a regra e o gesto — e nao e a da lane de status', async () => {
    const req = await novaRequisicao();
    await novaPendencia(req.id, { aprovadores: [U.bia], nome: 'Material crítico' });
    await rodar();
    const [e] = doAssunto('Material crítico');
    assert.ok(e, 'nao cobrou');
    assert.ok(e.assunto.startsWith(`Lembrete: Requisição ${req.numero} aguardando aprovação da regra "Material crítico" há 2 dias`),
      `assunto: ${e.assunto}`);
    assert.ok(e.text.startsWith('LEMBRETE — REQUISIÇÃO AGUARDANDO APROVAÇÃO DE REGRA'), e.text.slice(0, 80));
    assert.ok(e.text.includes('Regra: Material crítico'), 'o corpo nao nomeia a regra');
    assert.ok(e.text.includes('Acesse o sistema para assinar a aprovação da regra:'));
    assert.ok(e.html.includes('Material crítico'), 'o HTML nao nomeia a regra');
  });

  await test('(5) o log grava a tentativa com a pendencia', async () => {
    const req = await novaRequisicao();
    const p = await novaPendencia(req.id, { aprovadores: [U.bia], nome: 'Regra Log', criadaOffset: '-50 hours' });
    await rodar();
    const logs = await dbAll(db, 'SELECT destinatario, dias_aguardando, pendencia_regra_id FROM requisicao_lembretes_log WHERE requisicao_id = ?', [req.id]);
    assert.deepStrictEqual(logs.map((l) => [l.destinatario, l.pendencia_regra_id, l.dias_aguardando]),
      [['bia@test.com', p.id, 3]]);
  });

  await test('(6) com pendencia aberta a lane de STATUS nao cobra; sem ela, cobra (metade positiva)', async () => {
    const comRegra = await novaRequisicao();
    await novaPendencia(comRegra.id, { aprovadores: [U.bia], nome: 'Regra Trava Status' });
    const semRegra = await novaRequisicao();
    const assinada = await novaRequisicao();
    await novaPendencia(assinada.id, { aprovadores: [U.bia], nome: 'Regra Ja Assinada', status: 'APROVADA', aprovadorId: U.bia });
    await rodar();
    const daLaneStatus = (req) => enviados.filter((e) => e.assunto.includes(req.numero) && !e.assunto.includes('da regra'));
    assert.strictEqual(daLaneStatus(comRegra).length, 0,
      'a lane de status cobrou a lista geral por uma aprovacao que esta barrada pelas regras');
    assert.strictEqual(daLaneStatus(semRegra).length, 1, 'a lane de status parou de cobrar requisicao comum');
    assert.strictEqual(daLaneStatus(assinada).length, 1, 'com todas as regras assinadas a lane de status nao voltou');
  });

  await test('(7) um erro numa pendencia nao aborta o lote de pendencias', async () => {
    const reqA = await novaRequisicao();
    await novaPendencia(reqA.id, { aprovadores: [U.bia], nome: 'Regra Explode', criadaOffset: '-80 hours' });
    const reqB = await novaRequisicao();
    await novaPendencia(reqB.id, { aprovadores: [U.bia], nome: 'Regra Depois', criadaOffset: '-30 hours' });
    const orig = alertService.enviarEmail;
    alertService.enviarEmail = async (d, dest, assunto, ...rest) => {
      if (assunto.includes('Regra Explode')) throw new Error('falha proposital');
      return orig(d, dest, assunto, ...rest);
    };
    try {
      const r = await rodar();
      assert.strictEqual(doAssunto('Regra Depois').length, 1, 'uma pendencia ruim abortou o lote');
      const ruim = r.lembretes_regra.resultados.find((x) => x.regra_nome === 'Regra Explode');
      assert.ok(ruim && ruim.enviado === false, 'a pendencia que falhou sumiu do resultado');
    } finally {
      alertService.enviarEmail = orig;
    }
  });

  // ── Fase 5 (testes, 6 e 10): o nome da regra no HTML, e o aprovador inativo ────────────────
  await test('(8) o nome da regra sai ESCAPADO no HTML — na manchete e na linha Regra', async () => {
    const req = await novaRequisicao();
    await novaPendencia(req.id, { aprovadores: [U.bia], nome: 'Peças <b>&</b> caras' });
    await rodar();
    const [e] = doAssunto('Peças <b>&</b> caras');
    assert.ok(e, 'nao cobrou');
    assert.ok(!e.html.includes('<b>&</b>'), 'o nome da regra saiu CRU no HTML — quebra o e-mail');
    assert.ok(e.html.includes('Peças &lt;b&gt;&amp;&lt;/b&gt; caras'), 'o nome escapado nao aparece no HTML');
    // As TRÊS ocorrências (<title>, manchete e linha "Regra:") — uma só escapada deixava outra crua.
    assert.strictEqual(e.html.split('Peças &lt;b&gt;&amp;&lt;/b&gt; caras').length - 1, 3);
  });

  await test('(9) aprovador inativo sai da plateia; sem ninguem ativo, cai na lista geral', async () => {
    await dbRun(db, 'UPDATE usuarios SET ativo = 0 WHERE id = ?', [U.caio]);
    try {
      const req = await novaRequisicao();
      await novaPendencia(req.id, { aprovadores: [U.ana, U.caio], nome: 'Regra Com Inativo' });
      const req2 = await novaRequisicao();
      await novaPendencia(req2.id, { aprovadores: [U.caio], nome: 'Regra So Inativo' });
      await rodar();
      assert.deepStrictEqual(doAssunto('Regra Com Inativo')[0].destinatarios, ['ana@test.com']);
      assert.deepStrictEqual(doAssunto('Regra So Inativo')[0].destinatarios, [EMAIL_GERAL]);
    } finally {
      await dbRun(db, 'UPDATE usuarios SET ativo = 1 WHERE id = ?', [U.caio]);
    }
  });

  alertService.enviarEmail = enviarOriginal;
  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
