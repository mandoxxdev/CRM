/**
 * Etapa 27, Task 3 — as medidas entram na decisao de inspecao e a divergencia dimensional passa
 * a ser DERIVADA do numero.
 *
 * Ate aqui `divergencia_dimensional` era uma caixa que o inspetor marcava. Com plano (Task 2) e
 * regua (Task 1), ela vira medicao: se alguma caracteristica sai da tolerancia, a flag e 1 —
 * ainda que ninguem tenha marcado nada; se todas entram, ela e 0 — ainda que o payload mande 1.
 *
 * TRES COISAS QUE ESTE ARQUIVO GUARDA, e que sao a razao dele existir:
 *
 *  1. A ORDEM NO FLUXO (contrato C3, bloqueante). `decidirInspecao` reivindica saldo em DUAS
 *     fases sem transacao (`inspectionService.js:34`) e valida tudo antes da Fase 1 DE PROPOSITO
 *     (`:74`: "o saldo nao pode mudar quando isto recusa"). As recusas novas — plano inexistente,
 *     plano de outro material, instrumento vencido, medida nao numerica — TEM de rodar antes do
 *     claim da linha 90. Por isso cada teste de recusa afirma tambem que o item MANTEVE
 *     `quantidade_em_inspecao`: sem essa assercao, um 400 emitido DEPOIS de o saldo ter se movido
 *     passaria verde.
 *  2. O ATO NAO PODE SER PARCIAL. As medidas entram num unico INSERT multi-linha; quando o
 *     payload tem tres medidas e a segunda e invalida, o esperado e ZERO medida e ZERO inspecao —
 *     nunca a inspecao gravada com a flag ligada e a prova faltando (o defeito que a Etapa 23
 *     consertou no PUT /configuracoes).
 *  3. NaN APROVA, NAO REPROVA. A Task 1 mediu: na forma de guardas de rejeicao, `Number('12,4')`
 *     (virgula decimal de input pt-BR) nao dispara guarda nenhuma e sai CONFORME. Sem validacao
 *     explicita o defeito nao e falsa reprovacao, e falsa APROVACAO com `valor_medido` nulo. Por
 *     isso o cenario do '12,4' afirma o 400 E a ausencia total de escrita.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const receiptService = require('../../services/almoxarifado/receiptService');
const inspectionService = require('../../services/almoxarifado/inspectionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, { critico = true } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
     VALUES (?,?,'UN',0,1,?)`,
    [`MED-${seq}`, `Material medida ${seq}`, critico ? 1 : 0]);
  return r.lastID;
}

const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

const material = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const item = (db, id) => dbGet(db, 'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => stockService.getSaldoDisponivel(await material(db, id));

// Mesmo caminho de producao de inspecaoDecisao.api.test.js: material critico + recebimento
// aprovado deixa o item com retido de verdade, em vez de fabricar quantidade_em_inspecao na mao.
async function itemRetido(db, qtd = 10) {
  await setConfig(db, 'inspecao_material_critico', '1');
  const mat = await novoMaterial(db);
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    nota_fiscal: `NF-MED-${Date.now()}-${mat}`,
    itens: [{ material_id: mat, quantidade: qtd }],
  });
  await receiptService.aprovarRecebimento(db, ADMIN, rec.id);
  const it = await dbGet(db,
    'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
  return { mat, itemId: it.id, qtd };
}

async function novoPlano(db, materialId, campos = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO planos_inspecao_almoxarifado
    (material_id, caracteristica, unidade, valor_nominal, desvio_inferior, desvio_superior, ativo)
    VALUES (?,?,?,?,?,?,?)`, [
    materialId,
    campos.caracteristica || `Diametro externo ${seq}`,
    campos.unidade || 'mm',
    campos.valor_nominal !== undefined ? campos.valor_nominal : 10,
    campos.desvio_inferior !== undefined ? campos.desvio_inferior : -0.1,
    campos.desvio_superior !== undefined ? campos.desvio_superior : 0.1,
    campos.ativo === undefined ? 1 : campos.ativo,
  ]);
  return r.lastID;
}

async function novaFerramenta(db, { exige_calibracao = 0, ativo = 1, nome = 'Paquimetro' } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, tipo, exige_calibracao, ativo) VALUES (?,?,?,?,?)`,
    [`FERR-MED-${seq}`, `${nome} ${seq}`, 'MEDICAO', exige_calibracao ? 1 : 0, ativo ? 1 : 0]);
  return r.lastID;
}

// `vigente = false` grava uma calibracao JA VENCIDA de proposito: calibracaoVigente filtra por
// `date(data_validade) >= date('now')`, entao os dois casos que a mensagem literal cobre
// ("vencida" e "sem calibracao registrada") tem de ser exercitados.
const calibrar = (db, ferramentaId, vigente = true) => dbRun(db,
  `INSERT INTO calibracoes_ferramenta_almoxarifado (ferramenta_id, data_calibracao, data_validade)
   VALUES (?, date('now','-30 days'), date('now', ?))`,
  [ferramentaId, vigente ? '+180 days' : '-1 days']);

const inspecoesDoItem = (db, itemId) => dbAll(db,
  'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ?', [itemId]);
const medidasDaInspecao = (db, inspecaoId) => dbAll(db,
  'SELECT * FROM medidas_inspecao_almoxarifado WHERE inspecao_id = ? ORDER BY id', [inspecaoId]);
const todasAsMedidas = (db) => dbAll(db, 'SELECT * FROM medidas_inspecao_almoxarifado');

async function recusa(fn) {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error('esperava recusa, mas a chamada teve SUCESSO');
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ─── RN-03: a divergencia dimensional e DERIVADA, e vence o payload ────────────────────────
  // O par e obrigatorio. So o primeiro prova que a derivacao existe; so o par prova que ela
  // VENCE a marcacao manual.

  await test('(1) RN-03 medida FORA da tolerancia liga divergencia_dimensional SEM o payload marcar', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro fora', valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1 });

    const res = await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      // repare: NENHUMA flag no payload
      medidas: [{ plano_id: plano, valor_medido: 10.5 }],
    });

    const [insp] = await inspecoesDoItem(db, itemId);
    assert.ok(insp, 'a inspecao tem de ter sido gravada');
    assert.strictEqual(insp.divergencia_dimensional, 1,
      'medida 10.5 fora de [9.9, 10.1] tinha de LIGAR a flag sozinha — a divergencia nao foi derivada');
    assert.strictEqual(res.divergencia_dimensional, 1,
      'o retorno tem de expor a flag derivada, senao quem chamou nao sabe que o payload foi ignorado');

    const medidas = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(medidas.length, 1, 'a medida tem de ficar gravada como prova da reprovacao');
    assert.strictEqual(medidas[0].conforme, 0);
    assert.strictEqual(medidas[0].valor_medido, 10.5);
  });

  await test('(2) RN-03 todas DENTRO zeram a flag mesmo com o payload mandando 1', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro dentro', valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1 });

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      divergencia_dimensional: 1, // o inspetor marcou; a medida diz que nao
      medidas: [{ plano_id: plano, valor_medido: 10.05 }],
    });

    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual(insp.divergencia_dimensional, 0,
      'com medidas, a derivacao tem de VENCER a marcacao manual do payload');
    const medidas = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(medidas[0].conforme, 1);
  });

  await test('(3) RN-03 basta UMA reprovar entre varias, e as tres ficam gravadas', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const p1 = await novoPlano(db, mat, { caracteristica: 'Comprimento', valor_nominal: 50, desvio_inferior: -0.2, desvio_superior: 0.2 });
    const p2 = await novoPlano(db, mat, { caracteristica: 'Largura', valor_nominal: 20, desvio_inferior: -0.1, desvio_superior: 0.1 });
    const p3 = await novoPlano(db, mat, { caracteristica: 'Espessura', valor_nominal: 5, desvio_inferior: -0.05, desvio_superior: 0.05 });

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [
        { plano_id: p1, valor_medido: 50.1 },
        { plano_id: p2, valor_medido: 20.4 }, // esta reprova
        { plano_id: p3, valor_medido: 5 },
      ],
    });

    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual(insp.divergencia_dimensional, 1, 'uma reprovada entre tres ja liga a flag');
    const medidas = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(medidas.length, 3, 'as TRES medidas tem de estar gravadas, nao so a que reprovou');
    assert.deepStrictEqual(medidas.map((m) => m.conforme), [1, 0, 1]);
  });

  await test('(4) RN-02 a medida no limite EXATO da tolerancia e conforme (epsilon vale aqui dentro)', async () => {
    // 0.7 + 0.1 calcula 0.7999999999999999 em IEEE-754: sem o epsilon da Task 1, a peca no limite
    // exato reprovaria e a etapa FABRICARIA a divergencia que existe para medir.
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Folga', valor_nominal: 0.7, desvio_inferior: -0.1, desvio_superior: 0.1 });

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 0.8 }],
    });

    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual(insp.divergencia_dimensional, 0,
      'medida 0.8 no limite exato de 0.7+0.1 nao pode reprovar por ponto flutuante');
  });

  // ─── RN-04: instrumento descalibrado NAO MEDE ─────────────────────────────────────────────

  await test('(5) RN-04 ferramenta que exige calibracao e NAO tem vigente recusa com 400 e a literal do vizinho', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro calib' });
    const ferr = await novaFerramenta(db, { exige_calibracao: 1 });

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10, ferramenta_id: ferr }],
    }));
    assert.strictEqual(e.status, 400, `esperava 400, veio ${e.status}: ${e.message}`);
    assert.ok(e.message.includes('Ferramenta com calibração vencida ou sem calibração registrada'),
      `mensagem tem de ser a literal de toolService.js:70; veio: ${e.message}`);

    // C3: a recusa roda ANTES do claim de saldo.
    const it = await item(db, itemId);
    assert.strictEqual(it.quantidade_em_inspecao, qtd,
      'instrumento descalibrado recusou DEPOIS de o saldo do item ter se movido');
    assert.strictEqual((await inspecoesDoItem(db, itemId)).length, 0, 'nao pode ter gravado inspecao');
  });

  await test('(6) RN-04 calibracao VENCIDA tambem recusa (nao so a ausencia de calibracao)', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro vencido' });
    const ferr = await novaFerramenta(db, { exige_calibracao: 1 });
    await calibrar(db, ferr, false);

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10, ferramenta_id: ferr }],
    }));
    assert.strictEqual(e.status, 400, `esperava 400, veio ${e.status}: ${e.message}`);
    assert.ok(e.message.includes('Ferramenta com calibração vencida ou sem calibração registrada'));
  });

  await test('(7) RN-04 ferramenta com calibracao VIGENTE mede, e o nome dela e congelado na medida', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro vigente' });
    const ferr = await novaFerramenta(db, { exige_calibracao: 1, nome: 'Micrometro' });
    await calibrar(db, ferr, true);
    const nomeNoAto = (await dbGet(db, 'SELECT nome FROM ferramentas_almoxarifado WHERE id = ?', [ferr])).nome;

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10, ferramenta_id: ferr }],
    });

    const [insp] = await inspecoesDoItem(db, itemId);
    const [med] = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(med.ferramenta_id, ferr);
    assert.strictEqual(med.ferramenta_nome, nomeNoAto,
      'o nome do instrumento tem de ser congelado na medida — a ferramenta pode ser renomeada ou baixada');
  });

  await test('(8) RN-04 ferramenta que NAO exige calibracao mede sem calibracao nenhuma', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro sem exigencia' });
    const ferr = await novaFerramenta(db, { exige_calibracao: 0, nome: 'Trena' });

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10, ferramenta_id: ferr }],
    });
    const [insp] = await inspecoesDoItem(db, itemId);
    const [med] = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(med.ferramenta_id, ferr);
  });

  await test('(9) B2 ferramenta INEXISTENTE e 404, nao 500 (TypeError sobre undefined)', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro ferr fantasma' });

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10, ferramenta_id: 999999 }],
    }));
    assert.strictEqual(e.status, 404,
      `ferramenta inexistente tem de ser 404 (padrao toolService.js:64); veio ${e.status}: ${e.message}`);
    assert.ok(!/undefined|Cannot read/i.test(e.message),
      `veio um TypeError disfarcado de erro de negocio: ${e.message}`);
    const it = await item(db, itemId);
    assert.strictEqual(it.quantidade_em_inspecao, qtd, 'o 404 saiu depois de o saldo ter se movido');
  });

  await test('(10) B2 ferramenta INATIVA e 404', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro ferr inativa' });
    const ferr = await novaFerramenta(db, { ativo: 0 });

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10, ferramenta_id: ferr }],
    }));
    assert.strictEqual(e.status, 404, `esperava 404, veio ${e.status}: ${e.message}`);
  });

  // ─── RN-05: o plano e congelado no ato ────────────────────────────────────────────────────

  await test('(11) RN-05 editar o plano DEPOIS nao reescreve a inspecao antiga', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, {
      caracteristica: 'Diametro congelado', unidade: 'mm',
      valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1,
    });

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10.05 }],
    });

    // o plano muda depois do ato — nominal, desvios, nome e unidade
    await dbRun(db, `UPDATE planos_inspecao_almoxarifado
      SET valor_nominal = 99, desvio_inferior = -5, desvio_superior = 5,
          caracteristica = 'Diametro RENOMEADO', unidade = 'cm' WHERE id = ?`, [plano]);

    const [insp] = await inspecoesDoItem(db, itemId);
    const [med] = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(med.valor_nominal, 10, 'o nominal da medida tem de ser o do ATO, nao o de agora');
    assert.strictEqual(med.desvio_inferior, -0.1);
    assert.strictEqual(med.desvio_superior, 0.1);
    assert.strictEqual(med.caracteristica, 'Diametro congelado',
      'o nome da caracteristica tem de ser o do ATO — o plano nao pode reescrever a historia');
    assert.strictEqual(med.unidade, 'mm');
    assert.strictEqual(med.plano_id, plano, 'a referencia ao plano fica para rastreio, mas nao e a fonte dos valores');
  });

  // ─── RN-06 + A2: plano invalido recusa ANTES do claim de saldo ────────────────────────────

  await test('(12) RN-06+A2 plano_id INEXISTENTE e 400 E o item MANTEM quantidade_em_inspecao', async () => {
    const { itemId, qtd, mat } = await itemRetido(db, 10);
    const antesMat = await material(db, mat);

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: 999999, valor_medido: 10 }],
    }));
    assert.strictEqual(e.status, 400, `esperava 400, veio ${e.status}: ${e.message}`);

    // A ASSERCAO DE PESO desta task: a recusa tem de vir ANTES do claim da linha 90.
    const it = await item(db, itemId);
    assert.strictEqual(it.quantidade_em_inspecao, qtd,
      'o 400 saiu DEPOIS de o claim ter baixado o retido do item — a validacao esta no lugar errado do fluxo');
    const dep = await material(db, mat);
    assert.strictEqual(dep.quantidade_em_inspecao, antesMat.quantidade_em_inspecao,
      'o saldo do material nao pode ter se movido numa recusa');
    assert.strictEqual(await disponivel(db, mat), await stockService.getSaldoDisponivel(antesMat),
      'o disponivel do material nao pode ter se movido numa recusa');
    assert.strictEqual((await inspecoesDoItem(db, itemId)).length, 0, 'nao pode ter gravado inspecao');
  });

  await test('(13) RN-06 plano de OUTRO material e 400, e o saldo tambem fica intacto', async () => {
    const { itemId, qtd } = await itemRetido(db, 10);
    const outroMat = await novoMaterial(db);
    const planoAlheio = await novoPlano(db, outroMat, { caracteristica: 'Diametro alheio' });

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: planoAlheio, valor_medido: 10 }],
    }));
    assert.strictEqual(e.status, 400, `esperava 400, veio ${e.status}: ${e.message}`);
    const it = await item(db, itemId);
    assert.strictEqual(it.quantidade_em_inspecao, qtd, 'a recusa saiu depois do claim de saldo');
  });

  // ─── RN-07: medida nao numerica e 400, e NAO grava nada ───────────────────────────────────

  await test("(14) RN-07 valor_medido '12,4' e 400 — e nao vira aprovacao com valor nulo", async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro virgula', valor_nominal: 12.4, desvio_inferior: -0.1, desvio_superior: 0.1 });
    const medidasAntes = (await todasAsMedidas(db)).length;

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: '12,4' }],
    }));
    assert.strictEqual(e.status, 400,
      `virgula decimal de input pt-BR tem de recusar com 400; veio ${e.status}: ${e.message}`);

    assert.strictEqual((await todasAsMedidas(db)).length, medidasAntes,
      'nao pode ter gravado medida nenhuma — nem conforme, nem reprovada com valor nulo');
    assert.strictEqual((await inspecoesDoItem(db, itemId)).length, 0, 'nao pode ter gravado inspecao');
    const it = await item(db, itemId);
    assert.strictEqual(it.quantidade_em_inspecao, qtd, 'a recusa saiu depois do claim de saldo');
  });

  await test('(15) RN-07 valor_medido ausente/null/vazio tambem e 400 (Number(null) e 0, nao "medida zero")', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro nulo' });

    for (const valor of [null, undefined, '', '   ']) {
      const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
        quantidade_aprovada: qtd, quantidade_reprovada: 0,
        medidas: [{ plano_id: plano, valor_medido: valor }],
      }));
      assert.strictEqual(e.status, 400,
        `valor_medido ${JSON.stringify(valor)} tinha de recusar; veio ${e.status}: ${e.message}`);
    }
    const it = await item(db, itemId);
    assert.strictEqual(it.quantidade_em_inspecao, qtd);
  });

  await test('(16) A3 se a SEGUNDA de tres medidas e invalida, ZERO medida e ZERO inspecao ficam gravadas', async () => {
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const p1 = await novoPlano(db, mat, { caracteristica: 'Parcial A' });
    const p2 = await novoPlano(db, mat, { caracteristica: 'Parcial B' });
    const medidasAntes = (await todasAsMedidas(db)).length;

    const e = await recusa(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [
        { plano_id: p1, valor_medido: 10 },
        { plano_id: 999999, valor_medido: 10 }, // a do meio quebra
        { plano_id: p2, valor_medido: 10 },
      ],
    }));
    assert.strictEqual(e.status, 400, `esperava 400, veio ${e.status}: ${e.message}`);
    assert.strictEqual((await todasAsMedidas(db)).length, medidasAntes,
      'ato parcial: a primeira medida foi gravada antes de a segunda quebrar');
    assert.strictEqual((await inspecoesDoItem(db, itemId)).length, 0,
      'a inspecao nao pode existir sem as medidas que a justificam');
  });

  // ─── A6 e regressao: array vazio e ausencia de medidas ────────────────────────────────────

  await test('(17) A6 medidas: [] NAO ativa a derivacao — a flag manual do payload e preservada', async () => {
    const { itemId, qtd } = await itemRetido(db, 10);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      divergencia_dimensional: 1,
      medidas: [], // `[]` e TRUTHY: com `if (data.medidas)` isto zeraria a flag legitima
    });
    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual(insp.divergencia_dimensional, 1,
      'array vazio de medidas zerou a marcacao manual do inspetor');
    assert.strictEqual((await medidasDaInspecao(db, insp.id)).length, 0);
  });

  await test('(18) Regressao: inspecao SEM medidas segue manual e move saldo como hoje', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 7, quantidade_reprovada: 3,
      divergencia_dimensional: 1, divergencia_quantidade: 1,
    });
    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual(insp.divergencia_dimensional, 1, 'sem medidas a flag continua sendo a do payload');
    assert.strictEqual(insp.divergencia_quantidade, 1);
    assert.strictEqual(insp.quantidade_aprovada, 7);
    assert.strictEqual(insp.quantidade_reprovada, 3);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0, 'o retido tem de ter saido da quarentena');
    assert.strictEqual(m.quantidade_bloqueada, 3, 'a parte reprovada tem de ficar bloqueada');
    assert.strictEqual(await disponivel(db, mat), 7);
    assert.strictEqual((await medidasDaInspecao(db, insp.id)).length, 0);
  });

  await test('(19) com medidas o saldo continua se movendo normalmente (a derivacao nao troca quantidade)', async () => {
    const { mat, itemId } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro saldo' });
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 6, quantidade_reprovada: 4,
      medidas: [{ plano_id: plano, valor_medido: 10.5 }],
    });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_bloqueada, 4);
    assert.strictEqual(await disponivel(db, mat), 6);
    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual(insp.divergencia_dimensional, 1);
    assert.strictEqual(insp.conforme, 0, 'conforme continua vindo da QUANTIDADE reprovada, nao da medida');
  });

  await test('(20) caracteristica DESATIVADA depois do cadastro ainda pode ser medida (decisao declarada)', async () => {
    // Mesma regua da Task 2 para o material pai: valida por EXISTENCIA, nao por ativo = 1.
    // Recusar aqui travaria a inspecao em andamento porque alguem mexeu no cadastro no meio.
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro desativado' });
    await dbRun(db, 'UPDATE planos_inspecao_almoxarifado SET ativo = 0 WHERE id = ?', [plano]);

    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: 10 }],
    });
    const [insp] = await inspecoesDoItem(db, itemId);
    const [med] = await medidasDaInspecao(db, insp.id);
    assert.strictEqual(med.caracteristica, 'Diametro desativado');
  });

  await test('(21) [rota] o array `medidas` ATRAVESSA a fronteira HTTP e a flag derivada volta na resposta', async () => {
    // A rota de inspecao repassa `req.body` inteiro, sem Zod — mas este modulo ja tem rotas com
    // schema (a de transformacao de remessa), e a licao registrada la e que um campo novo que o
    // schema nao declara chega ao servico como `undefined` SEM erro nenhum. Se um dia esta rota
    // ganhar validacao de corpo e `medidas` ficar de fora, os 20 cenarios acima continuam verdes
    // (chamam o servico direto) e a feature para de existir pela tela. Este cenario e o unico que
    // cai nesse dia.
    const { mat, itemId, qtd } = await itemRetido(db, 10);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro pela rota', valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1 });

    const resp = await request(app)
      .post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: qtd, quantidade_reprovada: 0, medidas: [{ plano_id: plano, valor_medido: 10.5 }] });

    assert.strictEqual(resp.status, 201, `esperava 201, veio ${resp.status}: ${JSON.stringify(resp.body)}`);
    assert.strictEqual(resp.body.divergencia_dimensional, 1,
      'a flag derivada tem de voltar na resposta — senao a tela mostra uma coisa e o banco guarda outra');
    assert.strictEqual(resp.body.medidas_registradas, 1);
    const [insp] = await inspecoesDoItem(db, itemId);
    assert.strictEqual((await medidasDaInspecao(db, insp.id)).length, 1,
      'o array `medidas` nao chegou ao servico pela rota');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
