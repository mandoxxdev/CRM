/**
 * Etapa 128, T1 (tronco) — o tempo medio de recebimento no `indicadores` (feature 21): o bloco `tempo_recebimento` e a regua
 * escrita na `nota` do registro. RN-01..RN-08 do plano.
 *
 * A regua (deduzida, letra E): por recebimento, da chegada (`data_recebimento`, o DEFAULT do cabecalho) a ULTIMA entrada no
 * estoque dos itens com quantidade (`MAX(entrada_estoque_em)`); so os que entraram inteiros; os que entraram em parte em
 * `incompletos`; janela pelo fim. Sem considerado, `null` (B823).
 *
 * As datas sao semeadas no banco (`datetime('now', ...)`, o relogio do SQLite, UTC): nenhuma rota escreve uma hora escolhida, e o
 * que a regua mede e a diferenca. O caminho pela rota (criar -> aprovar/processar) e o T6 (tempoRecebimentoIntegracao). Cada
 * cenario limpa as duas tabelas do recebimento antes (o banco e :memory:, um por arquivo).
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa128-o-tempo-do-recebimento-e-o-aviso-da-retencao.md
 *
 * Executar: cd server && node tests/api/relatoriosTempoRecebimento.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const reportService = require('../../services/almoxarifado/reportService');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1281, nome: 'Admin E128', role: 'admin', is_superadmin: 1, email: 'e128@t.com' };
const NOTA_RN08 = 'Tempo de recebimento: da chegada da nota no sistema à última entrada no estoque dos itens, só os recebimentos '
  + 'que entraram inteiros e cuja última entrada está na janela; os que entraram em parte são contados à parte (incompletos) e os '
  + 'que ainda não entraram não aparecem; a inspeção depois da entrada não conta; materiais de clientes entram; entrada estornada '
  + 'continua contando.';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 128 T1: tempo medio de recebimento (indicadores) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });

  const limpar = async () => {
    await dbRun(db, 'DELETE FROM recebimentos_material_itens_almoxarifado');
    await dbRun(db, 'DELETE FROM recebimentos_material_almoxarifado');
  };
  const material = async ({ cliente = null, ativo = 1 } = {}) => {
    const c = `E128T-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, proprietario_cliente_id)
      VALUES (?, ?, 'PC', 0, ?, ?)`, [c, c, ativo, cliente])).lastID;
  };
  // `chegou` / `entrou`: deslocamento em HORAS a partir de agora (negativo = passado); entrou null = sem entrada.
  // itens: [{ entrou, recebida, esperada, material }]. Status: o de quem ainda da entrada (EM_ENTRADA_NF, a nota que falhou no meio)
  // quando algum item esta sem data, PROCESSADO quando todos tem — o que a rota produz; o cenario da Fase 2 (I3) passa outro.
  const recebimento = async (chegou, itens, status) => {
    const st = status || (itens.some((it) => it.entrou === null) ? 'EM_ENTRADA_NF' : 'PROCESSADO');
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, data_recebimento)
      VALUES (?, ?, datetime('now', ?))`, [`REC-E128T-${++seq}`, st, `${chegou} hours`])).lastID;
    for (const it of itens) {
      const m = it.material || await material();
      const recebida = it.recebida === undefined ? 5 : it.recebida;
      const esperada = it.esperada === undefined ? 5 : it.esperada;
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, entrada_estoque_em)
        VALUES (?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END)`,
      [r, m, esperada, recebida, it.entrou, `${it.entrou} hours`]);
    }
    return r;
  };
  const indic = async (janela = 30) => {
    setUser({ ...ADMIN });
    const r = await request(app).get(`/api/almoxarifado/relatorios/indicadores?janela_dias=${janela}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const bloco = async (janela) => (await indic(janela)).tempo_recebimento;

  await test('[RN-05] sem recebimento nenhum: o bloco existe, media e mediana null (nao 0), contagens 0', async () => {
    await limpar();
    assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 0 });
  });

  await test('[RN-01] a regua e a ULTIMA entrada: chegou T-10h, A entrou T-8h, B entrou T-4h -> 6 h (nao 2, nao 4)', async () => {
    await limpar();
    await recebimento(-10, [{ entrou: -8 }, { entrou: -4 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 6, mediana_horas: 6, considerados: 1, incompletos: 0 });
  });

  await test('[RN-05] media e mediana: 1, 2, 10 -> 4.33 e 2; com mais uma de 3 -> 4 e 2.5', async () => {
    await limpar();
    await recebimento(-20, [{ entrou: -19 }]);
    await recebimento(-20, [{ entrou: -18 }]);
    await recebimento(-20, [{ entrou: -10 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 4.33, mediana_horas: 2, considerados: 3, incompletos: 0 });
    await recebimento(-20, [{ entrou: -17 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 4, mediana_horas: 2.5, considerados: 4, incompletos: 0 });
  });

  await test('[RN-02] o que entrou em parte: fora da media, conta em incompletos; com so ele, media null', async () => {
    await limpar();
    await recebimento(-10, [{ entrou: -8 }, { entrou: null }]);
    assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 1 });
    await recebimento(-5, [{ entrou: -2 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 3, mediana_horas: 3, considerados: 1, incompletos: 1 });
  });

  await test('[RN-03] item sem quantidade (0) e sem entrada nao torna incompleto; o \'\' legado vale a esperada e torna', async () => {
    await limpar();
    await recebimento(-10, [{ entrou: -6 }, { entrou: null, recebida: 0 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 4, mediana_horas: 4, considerados: 1, incompletos: 0 });
    const r = await recebimento(-10, [{ entrou: -6 }], 'EM_ENTRADA_NF');
    const m = await material();
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
      VALUES (?, ?, 5, '')`, [r, m]);
    assert.deepStrictEqual(await bloco(), { media_horas: 4, mediana_horas: 4, considerados: 1, incompletos: 1 });
    // controle: o item '' legado com esperada 0 NAO torna (a quantidade e 0)
    await limpar();
    const r2 = await recebimento(-10, [{ entrou: -6 }], 'EM_ENTRADA_NF');
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
      VALUES (?, ?, 0, '')`, [r2, m]);
    assert.deepStrictEqual(await bloco(), { media_horas: 4, mediana_horas: 4, considerados: 1, incompletos: 0 });
  });

  await test('[RN-03] (Fase 2, I4) o texto "0,0" (legado; o REAL guarda "0" como numero, a virgula fica texto) com esperada 5 e sem entrada NAO torna incompleto (no SQLite texto > 0)', async () => {
    await limpar();
    const r = await recebimento(-10, [{ entrou: -6 }], 'EM_ENTRADA_NF');
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
      VALUES (?, ?, 5, '0,0')`, [r, await material()]);
    const tipo = await dbGet(db, 'SELECT typeof(quantidade_recebida) t FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND entrada_estoque_em IS NULL', [r]);
    assert.strictEqual(tipo.t, 'text', 'premissa: o legado e texto');
    assert.deepStrictEqual(await bloco(), { media_horas: 4, mediana_horas: 4, considerados: 1, incompletos: 0 });
  });

  await test('[RN-02] (Fase 2, I3) depois da entrada (APROVADO/PROCESSADO) o item que ganhou quantidade sem entrar nao torna incompleto; antes dela (EM_ENTRADA_NF) torna', async () => {
    for (const st of ['APROVADO', 'PROCESSADO']) {
      await limpar();
      await recebimento(-10, [{ entrou: -7 }, { entrou: null }], st);
      assert.deepStrictEqual(await bloco(), { media_horas: 3, mediana_horas: 3, considerados: 1, incompletos: 0 }, st);
    }
    await limpar();
    await recebimento(-10, [{ entrou: -7 }, { entrou: null }], 'EM_ENTRADA_NF');
    assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 1 });
  });

  await test('[RN-01] (Fase 2, M1) data_recebimento nula fica fora (nao entra como 0); o vizinho conta', async () => {
    await limpar();
    const r = await recebimento(-10, [{ entrou: -6 }]);
    await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET data_recebimento = NULL WHERE id = ?', [r]);
    await recebimento(-10, [{ entrou: -8 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 2, mediana_horas: 2, considerados: 1, incompletos: 0 });
  });

  await test('[RN-01] (Fase 2, I3) o item que ENTROU e depois foi reescrito para 0 (conferir sem guarda, C266) continua sendo o fim', async () => {
    await limpar();
    await recebimento(-10, [{ entrou: -8 }, { entrou: -1, recebida: 0 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 9, mediana_horas: 9, considerados: 1, incompletos: 0 });
  });

  await test('[RN-04] janela pelo FIM: chegou ha 40 dias e entrou ha 20 entra na de 30; entrou ha 31 dias fica fora (nem incompleto)', async () => {
    await limpar();
    await recebimento(-40 * 24, [{ entrou: -20 * 24 }]);
    let b = await bloco(30);
    assert.strictEqual(b.considerados, 1, JSON.stringify(b));
    assert.strictEqual(b.media_horas, 20 * 24);
    await recebimento(-40 * 24, [{ entrou: -31 * 24 }]);
    await recebimento(-40 * 24, [{ entrou: -31 * 24 }, { entrou: null }]);
    b = await bloco(30);
    assert.deepStrictEqual(b, { media_horas: 480, mediana_horas: 480, considerados: 1, incompletos: 0 });
    // a janela de 40 pega os tres
    b = await bloco(40);
    assert.deepStrictEqual([b.considerados, b.incompletos], [2, 1], JSON.stringify(b));
  });

  await test('[RN-04] (Fase 5 r3) janela pelo FIM = a ULTIMA entrada: A entrou ha 35 dias, B ha 10 -> entra na de 30 (720 h)', async () => {
    await limpar();
    await recebimento(-40 * 24, [{ entrou: -35 * 24 }, { entrou: -10 * 24 }]);
    assert.deepStrictEqual(await bloco(30), { media_horas: 720, mediana_horas: 720, considerados: 1, incompletos: 0 });
  });

  for (const st of ['RECEBIDO', 'CONFERIDO_ALMOX', 'ENCAMINHADO_FATURAMENTO']) {
    await test(`[RN-02] (Fase 5 r3) a entrada que falhou no meio vinda de ${st} (o /aprovar e o /processar aceitam) e incompleta`, async () => {
      await limpar();
      await recebimento(-10, [{ entrou: -7 }, { entrou: null }], st);
      assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 1 });
    });
  }

  await test('[RN-02] (Fase 5 r3) status NULL (legado) com item esperando e incompleto', async () => {
    await limpar();
    const r = await recebimento(-10, [{ entrou: -7 }, { entrou: null }], 'EM_ENTRADA_NF');
    await dbRun(db, 'UPDATE recebimentos_material_almoxarifado SET status = NULL WHERE id = ?', [r]);
    assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 1 });
  });

  await test('[RN-03] (Fase 5 r3) item de 0.5 sem entrada (EM_ENTRADA_NF) torna incompleto (CAST REAL, nao INTEGER)', async () => {
    await limpar();
    await recebimento(-10, [{ entrou: -7 }, { entrou: null, recebida: 0.5, esperada: 0.5 }], 'EM_ENTRADA_NF');
    assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 1 });
  });

  await test('[RN-04] recebimento sem entrada nenhuma (em conferencia) nao aparece', async () => {
    await limpar();
    await recebimento(-3, [{ entrou: null }, { entrou: null }]);
    assert.deepStrictEqual(await bloco(), { media_horas: null, mediana_horas: null, considerados: 0, incompletos: 0 });
    await recebimento(-3, [{ entrou: -1 }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 2, mediana_horas: 2, considerados: 1, incompletos: 0 });
  });

  await test('[RN-06] material de cliente e material inativado entram', async () => {
    await limpar();
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E128')")).lastID;
    await recebimento(-10, [{ entrou: -9, material: await material({ cliente: cli }) }]);
    await recebimento(-10, [{ entrou: -7, material: await material({ ativo: 0 }) }]);
    assert.deepStrictEqual(await bloco(), { media_horas: 2, mediana_horas: 2, considerados: 2, incompletos: 0 });
  });

  await test('[RN-07] janela_dias invalido: 400 literal de sempre; sem o parametro, a janela padrao (90) tambem traz o bloco', async () => {
    setUser({ ...ADMIN });
    const r = await request(app).get('/api/almoxarifado/relatorios/indicadores?janela_dias=0');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Parâmetro "janela_dias" deve ser um número inteiro maior que zero');
    await limpar();
    await recebimento(-60 * 24, [{ entrou: -60 * 24 + 5 }]);
    const p = await request(app).get('/api/almoxarifado/relatorios/indicadores');
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.body.janela_dias, 90);
    assert.deepStrictEqual(p.body.tempo_recebimento, { media_horas: 5, mediana_horas: 5, considerados: 1, incompletos: 0 });
  });

  await test('[RN-01] o servico direto da o mesmo bloco que a rota (frações de hora: 90 min -> 1.5)', async () => {
    await limpar();
    const r = await recebimento(-3, [{ entrou: -1 }]);
    await dbRun(db, "UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = datetime('now', '-90 minutes') WHERE recebimento_id = ?", [r]);
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET data_recebimento = datetime('now', '-180 minutes') WHERE id = ?", [r]);
    const direto = (await reportService.relatorioIndicadores(db, { janela_dias: 30 })).tempo_recebimento;
    assert.deepStrictEqual(direto, { media_horas: 1.5, mediana_horas: 1.5, considerados: 1, incompletos: 0 });
    assert.deepStrictEqual(await bloco(), direto);
  });

  await test('[RN-08] a nota do registro traz a regua literal', async () => {
    assert.ok(RELATORIOS.indicadores.nota.includes(NOTA_RN08), RELATORIOS.indicadores.nota);
  });

  await test('[contrato] os outros blocos continuam (giro, atendimento, no prazo, ajustes)', async () => {
    const b = await indic();
    for (const k of ['giro', 'cobertura', 'rupturas', 'valor_por_grupo', 'atendimento_requisicoes', 'requisicoes_no_prazo',
      'requisicoes_integrais', 'ajustes']) {
      assert.ok(k in b, `falta ${k}`);
    }
    const n = await dbGet(db, 'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado');
    assert.ok(n.n >= 1, 'premissa: ha recebimento no banco');
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
