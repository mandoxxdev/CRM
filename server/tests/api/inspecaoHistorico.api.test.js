/**
 * Etapa 29, Task 1 — a inspecao decidida e as medidas ganham LEITURA (RN-05, contratos C1/C2).
 *
 * Ate aqui a Etapa 27 gravava as medidas congeladas em `medidas_inspecao_almoxarifado` e NADA as
 * lia (C35): a prova da reprovacao existia no banco e era invisivel para quem inspeciona. Este
 * arquivo prova as duas rotas novas:
 *
 *   GET /api/almoxarifado/inspecoes/historico     (C1) — decididas, `data_inspecao DESC, id DESC`,
 *                                                   filtro `material_id`, `limite`, contagens
 *   GET /api/almoxarifado/inspecoes/:id/medidas   (C2) — medidas CONGELADAS, 404 se nao existe
 *
 * O que cada cenario guarda, e por que ele e como e:
 *  - "duas no mesmo segundo": `data_inspecao` tem resolucao de segundo, entao duas decisoes
 *    consecutivas EMPATAM na data. Sem `i.id DESC` a ordem entre elas e a que o sorter do SQLite
 *    quiser. O teste FORCA o empate por UPDATE direto no setup (achado 5 do plano): confiar que as
 *    duas decisoes caiam no mesmo segundo de relogio faria o teste passar as vezes sem provar nada.
 *  - "congelado": o PUT no plano acontece DEPOIS da decisao, e a resposta tem de continuar contando
 *    a historia do plano que vigorava no ato. O controle positivo deste cenario e trocar a leitura
 *    das colunas congeladas por JOIN no plano atual — a assercao do nominal cai.
 *  - "teto 500": nao se cria 501 inspecoes para provar um clamp. O teste passa um `db` falso ao
 *    servico e le o parametro que chegou ao SQL — e a fronteira real do clamp.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const inspectionService = require('../../services/almoxarifado/inspectionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 29, nome: 'Admin Etapa29', role: 'admin', is_superadmin: 1, email: 'e29@test.com' };
// Sem `perfil_almoxarifado` e sem role admin: getPerfilFromUser cai em PRODUCAO (chao de fabrica).
const SEM_PERFIL = { id: 291, nome: 'Chao de Fabrica' };

const HISTORICO = '/api/almoxarifado/inspecoes/historico';
const medidasDe = (id) => `/api/almoxarifado/inspecoes/${id}/medidas`;

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
     VALUES (?,?,'UN',0,1,1)`,
    [`HIS-${seq}`, `Material historico ${seq}`]);
  return r.lastID;
}

const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

// Mesmo caminho de producao de medidasInspecao.api.test.js: material critico + recebimento
// aprovado deixa o item retido de verdade. `mat` opcional para ter DOIS itens do MESMO material.
async function itemRetido(db, { qtd = 10, mat } = {}) {
  await setConfig(db, 'inspecao_material_critico', '1');
  const materialId = mat || await novoMaterial(db);
  seq += 1;
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    nota_fiscal: `NF-HIS-${seq}`,
    itens: [{ material_id: materialId, quantidade: qtd }],
  });
  await receiptService.aprovarRecebimento(db, ADMIN, rec.id);
  const it = await dbGet(db,
    'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
  return { mat: materialId, itemId: it.id, qtd, recebimentoId: rec.id };
}

async function novoPlano(db, materialId, campos = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO planos_inspecao_almoxarifado
    (material_id, caracteristica, unidade, valor_nominal, desvio_inferior, desvio_superior, ativo)
    VALUES (?,?,?,?,?,?,1)`, [
    materialId,
    campos.caracteristica || `Diametro ${seq}`,
    campos.unidade || 'mm',
    campos.valor_nominal !== undefined ? campos.valor_nominal : 10,
    campos.desvio_inferior !== undefined ? campos.desvio_inferior : -0.1,
    campos.desvio_superior !== undefined ? campos.desvio_superior : 0.1,
  ]);
  return r.lastID;
}

async function novaFerramenta(db, nome) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, tipo, exige_calibracao, ativo) VALUES (?,?,?,0,1)`,
    [`FERR-HIS-${seq}`, nome]);
  return r.lastID;
}

// Decide PELA ROTA (a mesma que a tela usa), nunca pelo servico: o historico tem de refletir o
// que o POST gravou, nao o que um atalho de teste gravou.
async function decidir(app, itemId, payload) {
  const res = await request(app)
    .post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
    .send(payload);
  assert.strictEqual(res.status, 201, `decisao tinha de dar 201, deu ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

(async () => {
  console.log('\n=== Etapa 29 Task 1: historico de inspecao e medidas congeladas (RN-05) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  await test('[RN-05] historico lista a decidida com medidas_total e nao_conformes', async () => {
    const { mat, itemId, qtd, recebimentoId } = await itemRetido(db);
    const p1 = await novoPlano(db, mat, { caracteristica: 'Diametro', valor_nominal: 10 });
    const p2 = await novoPlano(db, mat, { caracteristica: 'Comprimento', valor_nominal: 50, desvio_inferior: -0.2, desvio_superior: 0.2 });
    const ferr = await novaFerramenta(db, 'Paquimetro Historico');

    const decisao = await decidir(app, itemId, {
      quantidade_aprovada: qtd - 2, quantidade_reprovada: 2,
      encaminhamento: 'DEVOLVER', observacoes: 'duas fora',
      certificado_ausente: 1,
      medidas: [
        { plano_id: p1, valor_medido: '10.5', ferramenta_id: ferr }, // fora
        { plano_id: p2, valor_medido: '50.1' }, // dentro
      ],
    });

    const res = await request(app).get(HISTORICO);
    assert.strictEqual(res.status, 200, `historico deu ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body), 'a resposta e um array');
    const linha = res.body.find((l) => l.id === decisao.id);
    assert.ok(linha, 'a inspecao decidida tem de aparecer no historico');

    // Contrato C1, campo a campo — a tela da Task 3 mocka esta forma; se um nome mudar aqui, o
    // mock dela continua verde e a tela quebra em producao.
    const esperado = {
      id: decisao.id,
      recebimento_item_id: itemId,
      recebimento_id: recebimentoId,
      material_id: mat,
      quantidade_aprovada: qtd - 2,
      quantidade_reprovada: 2,
      conforme: 0,
      divergencia_quantidade: 0,
      divergencia_dimensional: 1, // derivada da medida fora (RN-03 da Etapa 27)
      certificado_ausente: 1,
      dano_fisico: 0,
      material_incorreto: 0,
      encaminhamento: 'DEVOLVER',
      observacoes: 'duas fora',
      responsavel_nome: ADMIN.nome,
      medidas_total: 2,
      medidas_nao_conformes: 1,
    };
    for (const [campo, valor] of Object.entries(esperado)) {
      assert.strictEqual(linha[campo], valor, `campo ${campo}: esperado ${JSON.stringify(valor)}, veio ${JSON.stringify(linha[campo])}`);
    }
    for (const campo of ['recebimento_numero', 'nota_fiscal', 'material_codigo', 'material_nome', 'material_unidade', 'data_inspecao']) {
      assert.ok(linha[campo] !== undefined && linha[campo] !== null, `campo ${campo} tem de vir preenchido`);
    }
    assert.ok(/^HIS-\d+$/.test(linha.material_codigo), `material_codigo veio ${linha.material_codigo}`);
    assert.strictEqual(linha.material_unidade, 'UN');
    assert.ok(/^NF-HIS-\d+$/.test(linha.nota_fiscal), `nota_fiscal veio ${linha.nota_fiscal}`);
  });

  await test('[RN-05] decidida SEM medidas aparece com medidas_total 0 (nao some do historico)', async () => {
    const { itemId, qtd } = await itemRetido(db);
    const decisao = await decidir(app, itemId, { quantidade_aprovada: qtd, quantidade_reprovada: 0 });
    const res = await request(app).get(HISTORICO);
    const linha = res.body.find((l) => l.id === decisao.id);
    assert.ok(linha, 'decidida sem medida tambem e historico');
    assert.strictEqual(linha.medidas_total, 0);
    assert.strictEqual(linha.medidas_nao_conformes, 0);
    assert.strictEqual(linha.conforme, 1);
    assert.strictEqual(linha.divergencia_dimensional, 0);
  });

  await test('[RN-05] item ainda PENDENTE nao aparece no historico', async () => {
    const { itemId } = await itemRetido(db);
    const res = await request(app).get(HISTORICO);
    assert.strictEqual(res.body.filter((l) => l.recebimento_item_id === itemId).length, 0,
      'so inspecao decidida (linha em inspecoes_recebimento) entra no historico');
  });

  await test('[RN-05] duas decididas no mesmo segundo saem em ordem de id DESC', async () => {
    const mat = await novoMaterial(db);
    const a = await itemRetido(db, { mat });
    const b = await itemRetido(db, { mat });
    const da = await decidir(app, a.itemId, { quantidade_aprovada: a.qtd, quantidade_reprovada: 0 });
    const dbb = await decidir(app, b.itemId, { quantidade_aprovada: b.qtd, quantidade_reprovada: 0 });
    assert.ok(dbb.id > da.id, 'setup: a segunda decisao tem id maior');

    // EMPATE FORCADO: a mesma data nas duas, por UPDATE direto. Sem isto o teste dependeria do
    // relogio e passaria (ou nao) por acaso.
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET data_inspecao = '2026-01-01 12:00:00'
      WHERE id IN (?, ?)`, [da.id, dbb.id]);

    const res = await request(app).get(HISTORICO).query({ material_id: mat });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.map((l) => l.id), [dbb.id, da.id],
      `empate em data_inspecao tem de desempatar por id DESC; veio ${JSON.stringify(res.body.map((l) => l.id))}`);
    assert.strictEqual(res.body[0].data_inspecao, res.body[1].data_inspecao, 'setup: as datas empatam');
  });

  await test('[RN-05] ordem principal: a decidida mais recente vem primeiro', async () => {
    const mat = await novoMaterial(db);
    const a = await itemRetido(db, { mat });
    const b = await itemRetido(db, { mat });
    const da = await decidir(app, a.itemId, { quantidade_aprovada: a.qtd, quantidade_reprovada: 0 });
    const dbb = await decidir(app, b.itemId, { quantidade_aprovada: b.qtd, quantidade_reprovada: 0 });
    // A de id MENOR ganha a data MAIOR: se a ordem fosse so por id, ela sairia por ultimo.
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET data_inspecao = '2026-02-01 12:00:00' WHERE id = ?`, [da.id]);
    await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET data_inspecao = '2026-01-01 12:00:00' WHERE id = ?`, [dbb.id]);

    const res = await request(app).get(HISTORICO).query({ material_id: mat });
    assert.deepStrictEqual(res.body.map((l) => l.id), [da.id, dbb.id],
      'data_inspecao DESC manda antes do id');
  });

  await test('[RN-05] filtro material_id', async () => {
    const x = await itemRetido(db);
    const y = await itemRetido(db);
    const dx = await decidir(app, x.itemId, { quantidade_aprovada: x.qtd, quantidade_reprovada: 0 });
    const dy = await decidir(app, y.itemId, { quantidade_aprovada: y.qtd, quantidade_reprovada: 0 });

    const res = await request(app).get(HISTORICO).query({ material_id: x.mat });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.map((l) => l.id), [dx.id], 'so a inspecao do material filtrado');
    assert.ok(res.body.every((l) => l.material_id === x.mat));

    const sem = await request(app).get(HISTORICO);
    assert.ok(sem.body.some((l) => l.id === dy.id), 'sem filtro, a do outro material esta la');

    // Filtro que nao e numero: ignorado (lista tudo), nunca 500 — mesma regua de `/pendentes`.
    const lixo = await request(app).get(HISTORICO).query({ material_id: 'abc' });
    assert.strictEqual(lixo.status, 200);
    assert.ok(lixo.body.length >= 2, 'material_id nao numerico nao filtra nada');
  });

  await test('[RN-05] limite: respeita o pedido, default 100 e teto 500', async () => {
    const mat = await novoMaterial(db);
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      const it = await itemRetido(db, { mat });
      ids.push((await decidir(app, it.itemId, { quantidade_aprovada: it.qtd, quantidade_reprovada: 0 })).id);
    }
    const um = await request(app).get(HISTORICO).query({ material_id: mat, limite: 1 });
    assert.strictEqual(um.status, 200);
    assert.strictEqual(um.body.length, 1, `limite=1 tem de devolver 1 linha, veio ${um.body.length}`);
    assert.strictEqual(um.body[0].id, ids[2], 'com limite, quem entra e a mais recente');

    const dois = await request(app).get(HISTORICO).query({ material_id: mat, limite: '2' });
    assert.strictEqual(dois.body.length, 2, 'limite como string tambem vale');

    // O clamp e provado na fronteira do SQL, com um db falso que devolve o parametro recebido —
    // criar 501 inspecoes so para ver 500 voltarem custaria segundos e provaria o mesmo.
    const capturas = [];
    const dbFalso = { all(sql, params, cb) { capturas.push({ sql, params }); cb(null, []); } };
    await inspectionService.listarHistorico(dbFalso, { limite: 9999 });
    await inspectionService.listarHistorico(dbFalso, {});
    await inspectionService.listarHistorico(dbFalso, { limite: 'abc' });
    await inspectionService.listarHistorico(dbFalso, { limite: 0 });
    await inspectionService.listarHistorico(dbFalso, { limite: -5 });
    const limites = capturas.map((c) => c.params[c.params.length - 1]);
    assert.deepStrictEqual(limites, [500, 100, 100, 100, 100],
      `[9999, ausente, 'abc', 0, -5] tinham de virar [500, 100, 100, 100, 100]; vieram ${JSON.stringify(limites)}`);
    assert.ok(capturas.every((c) => /LIMIT \?/.test(c.sql)), 'o limite vai como parametro, nao interpolado');
  });

  await test('[RN-05] medidas da inspecao com tolerancia CONGELADA (PUT no plano depois nao muda)', async () => {
    const { mat, itemId, qtd } = await itemRetido(db);
    const plano = await novoPlano(db, mat, { caracteristica: 'Diametro externo', unidade: 'mm', valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1 });
    const plano2 = await novoPlano(db, mat, { caracteristica: 'Altura', unidade: 'mm', valor_nominal: 5, desvio_inferior: -0.05, desvio_superior: 0.05 });
    const ferr = await novaFerramenta(db, 'Micrometro Congelado');

    const decisao = await decidir(app, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [
        { plano_id: plano, valor_medido: '10.05', ferramenta_id: ferr },
        { plano_id: plano2, valor_medido: '5.2' },
      ],
    });

    // Depois da decisao, a engenharia MUDA o plano: nome, unidade, nominal e faixa. Com a faixa
    // nova, 10.05 estaria FORA — se a rota lesse o plano atual, a historia da inspecao mudaria.
    const put = await request(app).put(`/api/almoxarifado/planos-inspecao/${plano}`)
      .send({ caracteristica: 'Diametro externo REVISADO', unidade: 'pol', valor_nominal: 12, desvio_inferior: -0.01, desvio_superior: 0.01 });
    assert.strictEqual(put.status, 200, `PUT no plano deu ${put.status}: ${JSON.stringify(put.body)}`);
    await dbRun(db, 'UPDATE ferramentas_almoxarifado SET nome = ? WHERE id = ?', ['Micrometro RENOMEADO', ferr]);

    const res = await request(app).get(medidasDe(decisao.id));
    assert.strictEqual(res.status, 200, `medidas deu ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.length, 2);
    assert.ok(res.body[0].id < res.body[1].id, 'em ordem de id');

    const [m1, m2] = res.body;
    assert.strictEqual(m1.plano_id, plano);
    assert.strictEqual(m1.caracteristica, 'Diametro externo', 'caracteristica congelada no ato, nao a renomeada');
    assert.strictEqual(m1.unidade, 'mm', 'unidade congelada');
    assert.strictEqual(m1.valor_nominal, 10, 'nominal congelado: o PUT mudou para 12 e a resposta nao pode acompanhar');
    assert.strictEqual(m1.desvio_inferior, -0.1, 'desvio inferior congelado');
    assert.strictEqual(m1.desvio_superior, 0.1, 'desvio superior congelado');
    assert.strictEqual(m1.valor_medido, 10.05);
    assert.strictEqual(m1.conforme, 1, 'conforme e o do ato: 10.05 estava dentro de [9.9, 10.1]');
    assert.strictEqual(m1.ferramenta_id, ferr);
    assert.strictEqual(m1.ferramenta_nome, 'Micrometro Congelado', 'nome do instrumento congelado');
    assert.ok(m1.created_at, 'created_at vem');

    assert.strictEqual(m2.plano_id, plano2);
    assert.strictEqual(m2.valor_medido, 5.2);
    assert.strictEqual(m2.conforme, 0);
    assert.strictEqual(m2.ferramenta_id, null);
    assert.strictEqual(m2.ferramenta_nome, null);

    // Contrato C2: exatamente estas chaves, para o mock da Task 3 nao inventar campo.
    assert.deepStrictEqual(Object.keys(m1).sort(), ['id', 'plano_id', 'caracteristica', 'unidade',
      'valor_nominal', 'desvio_inferior', 'desvio_superior', 'valor_medido', 'conforme',
      'ferramenta_id', 'ferramenta_nome', 'created_at'].sort());

    // E o historico continua contando o que o ato disse.
    const hist = await request(app).get(HISTORICO).query({ material_id: mat });
    const linha = hist.body.find((l) => l.id === decisao.id);
    assert.strictEqual(linha.medidas_total, 2);
    assert.strictEqual(linha.medidas_nao_conformes, 1);
  });

  await test('[RN-05] inspecao decidida SEM medidas responde [] (nao 404)', async () => {
    const { itemId, qtd } = await itemRetido(db);
    const decisao = await decidir(app, itemId, { quantidade_aprovada: qtd, quantidade_reprovada: 0 });
    const res = await request(app).get(medidasDe(decisao.id));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, []);
  });

  await test('[RN-05] 404 inspecao inexistente e 404 para id nao numerico (nao 500)', async () => {
    const inexistente = await request(app).get(medidasDe(999999));
    assert.strictEqual(inexistente.status, 404, `inexistente deu ${inexistente.status}`);
    assert.deepStrictEqual(inexistente.body, { error: 'Inspeção não encontrada' });

    for (const id of ['abc', 'NaN', 'Infinity', '1e999']) {
      const res = await request(app).get(medidasDe(id));
      assert.strictEqual(res.status, 404, `id '${id}' tinha de dar 404, deu ${res.status}: ${JSON.stringify(res.body)}`);
      assert.deepStrictEqual(res.body, { error: 'Inspeção não encontrada' });
    }
  });

  await test('[RN-05/D6] usuario sem perfil (fallback PRODUCAO) le historico e medidas -> 200', async () => {
    const { mat, itemId, qtd } = await itemRetido(db);
    const plano = await novoPlano(db, mat);
    const decisao = await decidir(app, itemId, {
      quantidade_aprovada: qtd, quantidade_reprovada: 0,
      medidas: [{ plano_id: plano, valor_medido: '10' }],
    });

    setUser({ ...SEM_PERFIL });
    try {
      const hist = await request(app).get(HISTORICO).query({ material_id: mat });
      assert.strictEqual(hist.status, 200, `historico sem perfil deu ${hist.status}: ${JSON.stringify(hist.body)}`);
      assert.deepStrictEqual(hist.body.map((l) => l.id), [decisao.id]);

      const med = await request(app).get(medidasDe(decisao.id));
      assert.strictEqual(med.status, 200, `medidas sem perfil deu ${med.status}: ${JSON.stringify(med.body)}`);
      assert.strictEqual(med.body.length, 1);

      // Contraste: o mesmo usuario NAO decide (gate `inspecionar` continua valendo) — D6 e "sem
      // gate NOVO na leitura", nao "sem gate".
      const outro = await itemRetido(db);
      const dec = await request(app)
        .post(`/api/almoxarifado/recebimentos/itens/${outro.itemId}/inspecionar`)
        .send({ quantidade_aprovada: outro.qtd, quantidade_reprovada: 0 });
      assert.strictEqual(dec.status, 403, 'a ESCRITA continua gateada para quem nao tem perfil');
    } finally {
      setUser({ ...ADMIN });
    }

    // Sem token: 401 (auth continua na frente das duas rotas).
    setUser(null);
    try {
      assert.strictEqual((await request(app).get(HISTORICO)).status, 401);
      assert.strictEqual((await request(app).get(medidasDe(decisao.id))).status, 401);
    } finally {
      setUser({ ...ADMIN });
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
