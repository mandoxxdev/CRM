/**
 * Etapa 10b, Task 2 — RN-03/RN-04: dupla contagem por duas pessoas + autoria.
 *
 * RN-04: autoria e sempre gravada no PUT /item, com ou sem a flag `dupla_contagem` da
 * conferencia — a primeira contagem preenche `contado_por_*`, cada contagem seguinte
 * sobrescreve `recontado_por_*` (fica o ultimo recontador). `GET /conferencias/:id` ecoa os
 * quatro campos por item (SELECT ic.* ja carrega por arrastao, sem mudanca no GET).
 *
 * RN-03: com `dupla_contagem: true` na conferencia, a RECONTAGEM tem de ser de outra pessoa.
 * Enquanto ninguem recontou (recontado = 0), o primeiro contador pode CORRIGIR a propria
 * contagem — correcao nao e recontagem (nao marca recontado, nao preenche recontado_por;
 * ruling da revisao final: sem esse caminho um typo dele congelava a conferencia inteira).
 * Depois da recontagem do colega, ele toma 400 literal — a comparacao e sempre contra
 * `contado_por_id` (o PRIMEIRO contador), nunca contra o anterior. E o GET esconde a contagem
 * do colega de quem nao e o ultimo autor MESMO SEM modo cego (Critical da revisao final: com
 * o input preenchido, um Tab "recontava" sem digitar nada). Sem a flag, o comportamento da
 * Etapa 10 fica intacto (mesma pessoa pode recontar).
 *
 * Executar: cd server && node tests/api/conferenciaDuplaContagem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const GESTOR = { id: 2, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100 } = {}) {
  seq += 1;
  const codigo = `DUPLA-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,1)`, [codigo, `Material Dupla ${seq}`, qtd]);
  return { id: r.lastID, codigo };
}

async function abrirConferencia(app, body = {}) {
  const res = await request(app).post('/api/almoxarifado/conferencias').send(body);
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function itemDoMaterial(db, confId, materialId) {
  const item = await dbGet(db,
    `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?`,
    [confId, materialId]);
  assert.ok(item, 'item nao encontrado na conferencia');
  return item;
}

async function getConferencia(app, confId) {
  const res = await request(app).get(`/api/almoxarifado/conferencias/${confId}`);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function contarItem(app, confId, itemId, quantidade) {
  return request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
    .send({ quantidade_contada: quantidade });
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('RN-04: primeira contagem grava contado_por e o GET ecoa', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);

    const res = await contarItem(app, conf.id, itemRow.id, 90);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.contado_por_nome, 'Almoxarife', JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, null, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, null, JSON.stringify(itemBanco));

    const detalhe = await getConferencia(app, conf.id);
    const itemGet = detalhe.itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(itemGet.contado_por_id, 3, JSON.stringify(itemGet));
    assert.strictEqual(itemGet.contado_por_nome, 'Almoxarife', JSON.stringify(itemGet));
    assert.strictEqual(itemGet.recontado_por_id, null, JSON.stringify(itemGet));
    assert.strictEqual(itemGet.recontado_por_nome, null, JSON.stringify(itemGet));
  });

  await test('RN-04: recontagem grava recontado_por sem tocar contado_por', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    const res = await contarItem(app, conf.id, itemRow.id, 88);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.recontagem, true, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.contado_por_nome, 'Almoxarife', JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Gestor', JSON.stringify(itemBanco));
  });

  await test('RN-03: o primeiro contador CORRIGE a propria contagem antes da recontagem — nao vira recontagem', async () => {
    // Revisao final de branch: sem este caminho, um typo do primeiro contador congelava o
    // item (a RN-08 fechou o contorno por valor invalido) e, acima da tolerancia, travava a
    // conferencia inteira ate outra pessoa logar. Correcao NAO marca recontado nem preenche
    // recontado_por — so a contagem de OUTRA pessoa e recontagem.
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    assert.strictEqual(conf.dupla_contagem, 1, JSON.stringify(conf));
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    const res = await contarItem(app, conf.id, itemRow.id, 91);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.recontagem, false, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(itemBanco.quantidade_contada), 91, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado, 0, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, null, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
  });

  await test('RN-03: depois da recontagem do colega, o primeiro contador toma 400 literal', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    await contarItem(app, conf.id, itemRow.id, 88);

    setUser(ALMOXARIFE);
    const res = await contarItem(app, conf.id, itemRow.id, 91);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Almoxarife)',
      JSON.stringify(res.body));

    // Nao mexeu no banco: a recontagem do Gestor continua intacta.
    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(itemBanco.quantidade_contada), 88, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
  });

  await test('RN-03: outra pessoa reconta normalmente', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    const res = await contarItem(app, conf.id, itemRow.id, 88);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.recontagem, true, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.recontado, 1, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Gestor', JSON.stringify(itemBanco));
  });

  await test('RN-03: o primeiro contador segue barrado na terceira contagem', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    const resGestor = await contarItem(app, conf.id, itemRow.id, 88);
    assert.strictEqual(resGestor.status, 200, JSON.stringify(resGestor.body));

    // A comparacao e contra o PRIMEIRO contador, nao o anterior: se fosse contra o anterior
    // (Gestor), o Almoxarife poderia recontar agora e sobrescrever a contagem do colega.
    setUser(ALMOXARIFE);
    const resAlmox = await contarItem(app, conf.id, itemRow.id, 92);
    assert.strictEqual(resAlmox.status, 400, JSON.stringify(resAlmox.body));
    assert.strictEqual(resAlmox.body.error,
      'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Almoxarife)',
      JSON.stringify(resAlmox.body));

    // A recontagem do Gestor continua intacta no banco.
    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(itemBanco.quantidade_contada), 88, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 2, JSON.stringify(itemBanco));
  });

  await test('[CONTROLE] sem a flag, a mesma pessoa reconta como na Etapa 10', async () => {
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    assert.strictEqual(conf.dupla_contagem, 0, JSON.stringify(conf));
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);

    const res1 = await contarItem(app, conf.id, itemRow.id, 90);
    assert.strictEqual(res1.status, 200, JSON.stringify(res1.body));

    const res2 = await contarItem(app, conf.id, itemRow.id, 89);
    assert.strictEqual(res2.status, 200, JSON.stringify(res2.body));
    assert.strictEqual(res2.body.recontagem, true, JSON.stringify(res2.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Almoxarife', JSON.stringify(itemBanco));
  });

  await test('RN-08: contagem invalida (null/texto/negativa) recusa 400 sem gravar nada', async () => {
    // Achado da revisao da Task 2: mandar "abc" (o front converte em null via parseFloat)
    // gravava NULL, devolvia o item a "nunca contado" e DESTRAVAVA o primeiro contador — o
    // numero final chegava ao estoque digitado por uma pessoa so, com a trilha dizendo dois.
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    for (const invalida of [null, 'abc', -5, undefined]) {
      const res = await contarItem(app, conf.id, itemRow.id, invalida);
      assert.strictEqual(res.status, 400, `esperava 400 para ${JSON.stringify(invalida)}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.error, 'Quantidade contada deve ser um número maior ou igual a zero');
    }
    // Nada mudou no banco — a primeira contagem continua la, e o item continua sem recontagem
    // (valor invalido nao reseta a sentinela: era o contorno que a RN-08 fechou).
    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(Number(itemBanco.quantidade_contada), 90, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado, 0, JSON.stringify(itemBanco));

    // CONTROLE do zero: contagem 0 e fisica e legitima (Critical da Etapa 10) — continua 200,
    // e vinda de OUTRA pessoa e recontagem de verdade.
    setUser(GESTOR);
    const resZero = await contarItem(app, conf.id, itemRow.id, 0);
    assert.strictEqual(resZero.status, 200, JSON.stringify(resZero.body));
    assert.strictEqual(resZero.body.recontagem, true, JSON.stringify(resZero.body));

    // Depois da recontagem do colega, o primeiro contador esta barrado de verdade.
    setUser(ALMOXARIFE);
    const resPrimeiro = await contarItem(app, conf.id, itemRow.id, 999);
    assert.strictEqual(resPrimeiro.status, 400, JSON.stringify(resPrimeiro.body));
  });

  await test('RN-03: modo cego + dupla contagem esconde a contagem do colega no GET', async () => {
    // Achado da revisao da Task 2: a blindagem do modo cego so removia quantidade_sistema/
    // divergencia — o recontador lia a contagem do primeiro contador antes de recontar, e os
    // quatro olhos viravam dois olhos e uma copia.
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { modo_cego: true, dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    // O proprio autor continua vendo o que digitou.
    const detalheAutor = await getConferencia(app, conf.id);
    const itemAutor = detalheAutor.itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(Number(itemAutor.quantidade_contada), 90, JSON.stringify(itemAutor));

    // O colega (GESTOR tem ajustar_estoque — usar um segundo ALMOXARIFE, que nao tem) NAO ve.
    const ALMOXARIFE2 = { id: 7, nome: 'Almoxarife Dois', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox2@test.com' };
    setUser(ALMOXARIFE2);
    const detalheColega = await getConferencia(app, conf.id);
    const itemColega = detalheColega.itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(itemColega.quantidade_contada, undefined, JSON.stringify(itemColega));
    assert.strictEqual(itemColega.quantidade_sistema, undefined, JSON.stringify(itemColega));
    // A autoria continua visivel — nao e numero de saldo.
    assert.strictEqual(itemColega.contado_por_nome, 'Almoxarife', JSON.stringify(itemColega));

    // Quem homologa (ajustar_estoque) ve tudo, como na Etapa 10.
    setUser(GESTOR);
    const detalheGestor = await getConferencia(app, conf.id);
    const itemGestor = detalheGestor.itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(Number(itemGestor.quantidade_contada), 90, JSON.stringify(itemGestor));

    // Revisao FINAL de branch (Critical): dupla contagem esconde a contagem do colega MESMO
    // SEM modo cego — este teste afirmava o contrario e estava certificando o buraco: o input
    // do recontador chegava preenchido e um Tab "recontava" sem digitar nada (saldo reescrito
    // 100->70 com trilha de duas pessoas). quantidade_sistema continua visivel (nao ha modo
    // cego), quantidade_contada do colega NAO.
    setUser(ALMOXARIFE);
    const matAberto = await novoMaterial(db);
    const confAberta = await abrirConferencia(app, { dupla_contagem: true });
    const itemAberto = await itemDoMaterial(db, confAberta.id, matAberto.id);
    await contarItem(app, confAberta.id, itemAberto.id, 50);
    setUser(ALMOXARIFE2);
    const detalheSemCego = await getConferencia(app, confAberta.id);
    const itemSemCego = detalheSemCego.itens.find((i) => i.material_id === matAberto.id);
    assert.strictEqual(itemSemCego.quantidade_contada, undefined, JSON.stringify(itemSemCego));
    assert.strictEqual(Number(itemSemCego.quantidade_sistema), 100, JSON.stringify(itemSemCego));
    // O proprio autor continua vendo o que digitou.
    setUser(ALMOXARIFE);
    const detalheAutorAberto = await getConferencia(app, confAberta.id);
    const itemAutorAberto = detalheAutorAberto.itens.find((i) => i.material_id === matAberto.id);
    assert.strictEqual(Number(itemAutorAberto.quantidade_contada), 50, JSON.stringify(itemAutorAberto));
  });

  await test('RN-03: superadmin nao tem bypass da dupla contagem', async () => {
    // Buraco de regressao apontado pela revisao: um `!req.user.is_superadmin &&` no gate
    // passava com a suite toda verde. O ADMIN como primeiro contador tem de tomar 400 igual —
    // DEPOIS da recontagem do colega (antes dela, corrigir a propria contagem e permitido
    // para todo mundo, ruling da revisao final).
    setUser(ADMIN);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, { dupla_contagem: true });
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(ADMIN);
    const res = await contarItem(app, conf.id, itemRow.id, 91);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Admin Teste)',
      JSON.stringify(res.body));
  });

  await test('RN-04: com tres contadores fica o ULTIMO recontador', async () => {
    // Buraco de regressao apontado pela revisao: um COALESCE guardando o PRIMEIRO recontador
    // passava com a suite toda verde. O design diz "sobrescrevendo — fica o ultimo".
    setUser(ALMOXARIFE);
    const mat = await novoMaterial(db);
    const conf = await abrirConferencia(app, {});
    const itemRow = await itemDoMaterial(db, conf.id, mat.id);
    await contarItem(app, conf.id, itemRow.id, 90);

    setUser(GESTOR);
    await contarItem(app, conf.id, itemRow.id, 88);
    setUser(ADMIN);
    const res = await contarItem(app, conf.id, itemRow.id, 87);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const itemBanco = await itemDoMaterial(db, conf.id, mat.id);
    assert.strictEqual(itemBanco.contado_por_id, 3, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_id, 1, JSON.stringify(itemBanco));
    assert.strictEqual(itemBanco.recontado_por_nome, 'Admin Teste', JSON.stringify(itemBanco));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
