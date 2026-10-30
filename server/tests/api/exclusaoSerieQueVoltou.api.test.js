/**
 * Etapa 120 (C251; B780) — a exclusao da requisicao cuja entrega teve as series de volta por uma Entrada.
 *
 * Achado da Fase 2 da 120 (revisor com sonda): a exclusao da requisicao desfaz cada Saida da entrega com uma ENTRADA. Quando as
 * series da Saida tinham voltado TODAS por uma Entrada avulsa (a reativacao apaga o vinculo com a saida), a exclusao nao achava
 * serie vinculada, tratava como dado legado e creditava a quantidade sem serie: fisico 4 com 2 series presentes, com a serie
 * ligada (anterior a 120) e com ela desligada (a C234 nesta porta). Desde a 120 a exclusao le a saida de onde a serie voltou
 * (a coluna da B779) e recusa.
 *
 * Executar: cd server && node tests/api/exclusaoSerieQueVoltou.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const VOLTARAM = (nome) => `${nome}: as séries desta entrega já voltaram ao estoque por uma Entrada — excluir a requisição `
  + 'devolveria o saldo de novo. Encerre a requisição em vez de excluir.';

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  const v2 = (m, b) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'esv120',
    justificativa: 'esv120', documento_vinculado: 'NF-ESV120', ...b });
  const ids = async (m) => (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id]))
    .map((x) => x.id);
  const estado = async (m) => ({
    fisico: (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f,
    presentes: (await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status = 'EM_ESTOQUE'", [m.id])).n,
  });
  const ativa = async (req) => (await dbGet(db, 'SELECT COALESCE(ativo, 1) a FROM requisicoes_almoxarifado WHERE id = ?', [req])).a;

  /** Material com serie, Entrada V1 V2, requisicao Entregue cuja Saida (V1, V2) e da requisicao. */
  async function entregaDeDuasSeries() {
    seq += 1;
    const nome = `ESV120-${seq}`;
    const m = { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, controle_serie) VALUES (?, ?, 'PC', 0, 0, 10, 1, 1)`, [nome, nome])).lastID, nome };
    assert.strictEqual((await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] })).status, 201);
    const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'ENTREGUE')`, [`REQ-ESV120-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue, quantidade_atendida) VALUES (?, ?, 2, 2, 2, 2)`, [req, m.id]);
    const s = await v2(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await ids(m) });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [req, s.body.id]); // como a entrega
    return { m, req, saida: s.body.id };
  }
  const excluir = (req) => request(app).delete(`/api/almoxarifado/requisicoes/${req}`).send({ justificativa: 'esv120' });

  console.log('\n=== Etapa 120: a exclusao da requisicao cuja entrega teve as series de volta (C251) ===\n');

  await test('[RN-12] serie LIGADA, V1 e V2 voltaram por uma Entrada: excluir -> 400, fisico 2, a requisicao continua', async () => {
    const { m, req } = await entregaDeDuasSeries();
    assert.strictEqual((await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] })).status, 201);
    const r = await excluir(req);
    assert.strictEqual(r.status, 400, `excluiu e creditou em dobro: ${JSON.stringify(r.body)} ${JSON.stringify(await estado(m))}`);
    assert.strictEqual(r.body.error, VOLTARAM(m.nome));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
    assert.strictEqual(await ativa(req), 1);
  });

  await test('[RN-13] serie DESLIGADA depois, V1 e V2 voltaram: excluir -> 400 com a mesma literal, fisico 2', async () => {
    const { m, req } = await entregaDeDuasSeries();
    assert.strictEqual((await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] })).status, 201);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 0 WHERE id = ?', [m.id]);
    const r = await excluir(req);
    assert.strictEqual(r.status, 400, `excluiu e creditou em dobro: ${JSON.stringify(r.body)} ${JSON.stringify(await estado(m))}`);
    assert.strictEqual(r.body.error, VOLTARAM(m.nome));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
  });

  await test('[RN-14] nao regride: as series ainda fora -> excluir 200, fisico 2, V1 e V2 de volta', async () => {
    const { m, req } = await entregaDeDuasSeries();
    const r = await excluir(req);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
    assert.strictEqual(await ativa(req), 0);
  });

  /** A devolucao citando a saida, com V1 V2, desfeita pelo livro: as series voltam a Entregue NESSA saida (a linha fica). */
  async function devolucaoDesfeita(m, saida) {
    const d = await request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, quantidade: 2,
      motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saida, series: ['V1', 'V2'] });
    assert.strictEqual(d.status, 201, JSON.stringify(d.body));
    const ed = (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'", [m.id])).id;
    const e = await request(app).post(`/api/almoxarifado/movimentacoes/${ed}/cancelar`).send({ motivo: 'esv120' });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    const linhas = await dbGet(db, 'SELECT COUNT(*) n FROM series_entrada_anterior_almoxarifado WHERE saida_anterior_id = ?', [saida]);
    assert.strictEqual(linhas.n, 2, 'premissa: a linha da reativacao da devolucao fica');
  }

  await test('[RN-16] (Fase 5, r3) a devolucao desfeita nao conta como "voltou": serie ligada, excluir -> 200, fisico 2, V1 V2 de volta', async () => {
    const { m, req, saida } = await entregaDeDuasSeries();
    await devolucaoDesfeita(m, saida);
    const r = await excluir(req);
    assert.strictEqual(r.status, 200, `falso positivo: ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 });
  });

  await test('[RN-16b] (Fase 5, r3) o mesmo com a serie desligada: a recusa da 116 (religue), nao a de "ja voltaram"', async () => {
    const { m, req, saida } = await entregaDeDuasSeries();
    await devolucaoDesfeita(m, saida);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 0 WHERE id = ?', [m.id]);
    const r = await excluir(req);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `${m.nome}: esta entrega baixou 2 série(s) e o controle por número de série do material `
      + 'foi desligado depois — excluir a requisição devolveria o saldo sem devolver as séries. Religue o controle por '
      + 'número de série no cadastro do material e exclua de novo.');
  });

  await test('[RN-15] (Fase 5, r2) a Entrada das series e o desligar no meio da exclusao esperam: 200, fisico 2, 2 presentes', async () => {
    // Depois que a exclusao le as series Entregue da saida, dispara (sem esperar) uma Entrada de V1 V2 e o desligar da serie.
    // Sem a trava do material a Entrada reativava as series, o desligar passava e a ENTRADA do estorno creditava sem serie:
    // fisico 4 com 2 series. Sob a trava os dois esperam a exclusao terminar.
    const { m, req } = await entregaDeDuasSeries();
    // Os dois gestos partem do contexto do TESTE (nao de dentro do gancho): disparados dali herdariam o contexto da secao da
    // exclusao (AsyncLocalStorage) e passariam direto pela trava — o teste provaria nada.
    const original = db.all; let disparou = false; let sinal;
    const lido = new Promise((res) => { sinal = res; });
    db.all = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes("status = 'ENTREGUE' AND movimentacao_saida_id")) {
        disparou = true;
        return original.call(db, sql, params, (err, rows) => { sinal(); setTimeout(() => cb(err, rows), 40); });
      }
      return original.call(db, sql, params, cb);
    };
    let r; let entrada; let desligou;
    try {
      const exclusao = excluir(req).then((x) => x);
      await lido;
      // Etapa 193 Fase 5 (T4): o desligar vai pela porta do almoxarifado com a chave ligada e o superadmin (pode desligar com
      // series presentes) — sem a chave a rota recusava 403 calada (cadastro so no Compras) e o desligar nunca entrava na
      // corrida; pelo Compras, desligar a serie de material com series registradas e recusado (400, R1). Disparado JUNTO com
      // a Entrada (nao depois dela: a Entrada espera a trava, e o desligar enviado depois ja chegava com a exclusao feita).
      process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
      const desligar = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: false }).then((x) => x);
      const e = await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
      entrada = e.status;
      desligou = await desligar;
      r = await exclusao;
    } finally { db.all = original; delete process.env.ALMOX_CADASTRO_MATERIAL; }
    assert.ok(disparou, 'gancho da leitura das series nao disparou');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await estado(m), { fisico: 2, presentes: 2 }, 'a exclusao creditou sem serie no meio da Entrada');
    assert.strictEqual(entrada, 400, 'a Entrada das series que a exclusao devolveu deveria recusar (ja em estoque)');
    assert.strictEqual(desligou.status, 200, JSON.stringify(desligou.body));
    assert.strictEqual((await dbGet(db, 'SELECT controle_serie c FROM materiais_almoxarifado WHERE id = ?', [m.id])).c, 0);
  });

  await test('[RN-14b] declarado (Fase 5, r1): a Entrada de volta estornada com a serie desligada -> a exclusao recusa', async () => {
    // Como a RN-08b do estorno: a C225 deixa V1 e V2 "Em estoque" com o fisico 0; antes da 120 a exclusao passava (fisico 2) e o
    // estado batia por acaso. Recusar nunca conta em dobro; o acerto e por Ajuste.
    const { m, req } = await entregaDeDuasSeries();
    const e = await v2(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    assert.strictEqual(e.status, 201);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 0 WHERE id = ?', [m.id]);
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${e.body.id}/cancelar`).send({ motivo: 'esv120' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const r = await excluir(req);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, VOLTARAM(m.nome));
    assert.deepStrictEqual(await estado(m), { fisico: 0, presentes: 2 });
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
