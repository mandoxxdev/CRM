/**
 * Etapa 121 (C253; B783) — a devolucao nao devolve de novo o que ja voltou ao estoque por outra entrada.
 *
 * C253 (achada pelo revisor r1 da 120, anterior a ela): Entrada 2 (V1, V2) -> Saida S das duas -> Entrada avulsa de V1 e V2
 * (as pecas voltaram sem a Devolucao) -> o Administrador desliga a serie -> `POST /devolucoes` ESTOQUE de 2 citando S -> 201,
 * fisico 4 com 2 pecas. A conta do "restante" da saida (`returnService.validarSaidaOriginal`, o INSERT condicional e o
 * `saldo_devolvivel` de `listarSaidasElegiveis`) so descontava a devolucao viva; a volta por outra entrada apaga o vinculo da
 * serie com a saida e ninguem mais via. Desde a 120 a reativacao guarda a saida de onde a serie saiu
 * (`series_entrada_anterior_almoxarifado.saida_anterior_id`); a 121 desconta essas series — menos as que voltaram pela
 * entrada de uma devolucao QUE CITA a saida (essas ja contam como devolvidas).
 *
 * Molde: `serieQueVoltou.api.test.js` (o desligar pela rota) e `devolucaoVinculo.api.test.js` (as duas pontas).
 *
 * Executar: cd server && node tests/api/devolucaoDoQueVoltou.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
/** A literal da recusa com a volta por outra entrada (contrato do plano da 121). */
const ACIMA = (s, q, d, v, r) => `Devolução acima do entregue: a saída ${s} entregou ${q}, já foram devolvidos ${d}, `
  + `${v} ${v > 1 ? 'já voltaram' : 'já voltou'} ao estoque por uma entrada que não cita esta saída e restam ${r}`;
/** A literal de sempre (sem volta por outra entrada) — nao muda. */
const ACIMA_DE_SEMPRE = (s, q, d, r) => `Devolução acima do entregue: a saída ${s} entregou ${q}, já foram devolvidos ${d} e restam ${r}`;

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  async function material() {
    seq += 1;
    const codigo = `DQV121-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, controle_serie)
      VALUES (?, ?, 'PC', 0, 0, 10, 1, 1)`, [codigo, codigo])).lastID;
    return { id, codigo };
  }
  const ultimo = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'dqv121',
      justificativa: 'dqv121', documento_vinculado: 'NF-DQV121', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultimo(m, body.tipo);
  };
  const estornar = async (movId) => {
    const r = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'dqv121' });
    assert.strictEqual(r.status, 200, `estorno ${movId}: ${JSON.stringify(r.body)}`);
  };
  const desligar = async (m) => {
    const r = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: false });
    assert.strictEqual(r.status, 200, `desligar: ${JSON.stringify(r.body)}`);
  };
  const devolver = (m, saidaId, quantidade, extra = {}) => request(app).post('/api/almoxarifado/devolucoes').send({
    material_id: m.id, quantidade, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE',
    ...(saidaId ? { movimentacao_saida_id: saidaId } : {}), ...extra });
  const elegivel = async (m, saidaId) => {
    const r = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${m.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const s = r.body.find((x) => x.id === saidaId);
    assert.ok(s, `a saida ${saidaId} sumiu da lista: ${JSON.stringify(r.body)}`);
    return s;
  };
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f;
  const devolucoes = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?',
    [m.id])).n;
  const idsSeries = async (m, numeros) => (await dbAll(db,
    `SELECT id FROM series_almoxarifado WHERE material_id = ? ${numeros ? `AND numero IN (${numeros.map(() => '?').join(',')})` : ''}
      ORDER BY numero`, [m.id, ...(numeros || [])])).map((x) => x.id);

  /** Entrada 2 (V1, V2) -> Saida 2 com as duas. */
  async function saidaDeDuasSeries() {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const s = await mov(m, { tipo: 'SAIDA', quantidade: 2, serie_ids: await idsSeries(m) });
    return { m, s };
  }

  console.log('\n=== Etapa 121: a devolucao do que ja voltou (C253) ===\n');

  await test('[RN-01] as duas voltaram por uma Entrada, a serie desligada: a lista diz 0 e a devolucao de 2 recusa, fisico 2', async () => {
    const { m, s } = await saidaDeDuasSeries();
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    await desligar(m);
    const el = await elegivel(m, s);
    assert.strictEqual(el.saldo_devolvivel, 0, `a lista ofereceu devolver: ${JSON.stringify(el)}`);
    assert.strictEqual(el.quantidade_reentrada, 2, JSON.stringify(el));
    assert.strictEqual(el.quantidade_devolvida, 0, JSON.stringify(el));
    const r = await devolver(m, s, 2);
    assert.strictEqual(r.status, 400, `a devolucao contou em dobro: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, ACIMA(s, 2, 0, 2, 0));
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await devolucoes(m), 0, 'a recusa deixou a linha da devolucao');
  });

  await test('[RN-02] a serie ligada: a lista diz 0 e a recusa e a mesma, antes da conferencia das series', async () => {
    const { m, s } = await saidaDeDuasSeries();
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const el = await elegivel(m, s);
    assert.strictEqual(el.saldo_devolvivel, 0, JSON.stringify(el));
    assert.strictEqual(el.quantidade_reentrada, 2, JSON.stringify(el));
    const r = await devolver(m, s, 2, { series: ['V1', 'V2'] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(s, 2, 0, 2, 0));
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-03] so V1 voltou, a serie desligada: restam 1 — a de 2 recusa (singular), a de 1 passa, fisico 2', async () => {
    const { m, s } = await saidaDeDuasSeries();
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['V1'] });
    await desligar(m);
    const el = await elegivel(m, s);
    assert.strictEqual(el.saldo_devolvivel, 1, JSON.stringify(el));
    assert.strictEqual(el.quantidade_reentrada, 1, JSON.stringify(el));
    let r = await devolver(m, s, 2);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(s, 2, 0, 1, 1));
    r = await devolver(m, s, 1);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual((await elegivel(m, s)).saldo_devolvivel, 0);
  });

  await test('[RN-04] a volta por uma devolucao que NAO cita a saida tambem conta', async () => {
    const { m, s } = await saidaDeDuasSeries();
    const avulsa = await devolver(m, null, 2, { series: ['V1', 'V2'] });
    assert.strictEqual(avulsa.status, 201, JSON.stringify(avulsa.body));
    await desligar(m);
    assert.strictEqual((await elegivel(m, s)).saldo_devolvivel, 0);
    const r = await devolver(m, s, 2);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(s, 2, 0, 2, 0));
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-04b] (Fase 2, I1) declarado: a devolucao sem serie e a volta de uma peca somam — recusa; a avulsa resolve', async () => {
    // S de 2 -> RETRABALHO 1 citando S (o destino nao leva serie: V1 e V2 ficam Entregue) -> uma peca volta por uma Entrada V1.
    // Nao ha como saber se V1 e a peca do retrabalho (resta V2) ou a outra (nao resta nada). A soma (restam 0) e a conta
    // conservadora — o MAIOR dos dois (restaria 1) devolveria em dobro no segundo caso. B785: a peca que esta fora volta pela
    // devolucao AVULSA (sem citar a saida).
    const a = await saidaDeDuasSeries();
    let r = await devolver(a.m, a.s, 1, { destino: 'RETRABALHO' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await mov(a.m, { tipo: 'ENTRADA', quantidade: 1, series: ['V1'] });
    let el = await elegivel(a.m, a.s);
    assert.strictEqual(el.saldo_devolvivel, 0, JSON.stringify(el));
    r = await devolver(a.m, a.s, 1, { series: ['V2'] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(a.s, 2, 1, 1, 0));
    r = await devolver(a.m, null, 1, { series: ['V2'] });
    assert.strictEqual(r.status, 201, `a avulsa nao resolveu: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await fisico(a.m), 2);
    // Misto: a devolucao citando S COM V1 e a volta de V2 por uma Entrada -> as duas voltaram, restam 0 (a soma e exata).
    const c = await saidaDeDuasSeries();
    r = await devolver(c.m, c.s, 1, { series: ['V1'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await mov(c.m, { tipo: 'ENTRADA', quantidade: 1, series: ['V2'] });
    await desligar(c.m);
    el = await elegivel(c.m, c.s);
    assert.strictEqual(el.saldo_devolvivel, 0, JSON.stringify(el));
    r = await devolver(c.m, c.s, 1);
    assert.strictEqual(r.status, 400, `devolveu em dobro: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, ACIMA(c.s, 2, 1, 1, 0));
    assert.strictEqual(await fisico(c.m), 2);
  });

  await test('[RN-05] nao regride: a devolucao que cita a saida conta uma vez so; a desfeita pelo livro nao conta', async () => {
    // (a) devolucao citando S com V1 (viva): restam 1, nao 0 — a linha da reativacao dela cita S e nao pode contar de novo.
    const a = await saidaDeDuasSeries();
    let r = await devolver(a.m, a.s, 1, { series: ['V1'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    let el = await elegivel(a.m, a.s);
    assert.strictEqual(el.saldo_devolvivel, 1, `a devolucao contou duas vezes: ${JSON.stringify(el)}`);
    assert.strictEqual(el.quantidade_reentrada, 0, JSON.stringify(el));
    r = await devolver(a.m, a.s, 2, { series: ['V2', 'V1'] });
    assert.strictEqual(r.body.error, ACIMA_DE_SEMPRE(a.s, 2, 1, 1), 'a literal de sempre mudou');
    r = await devolver(a.m, a.s, 1, { series: ['V2'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(a.m), 2);
    // (b) devolucao citando S com V1 e V2, a entrada dela estornada (as series voltam a S), desliga -> devolve 2, fisico 2.
    const b = await saidaDeDuasSeries();
    r = await devolver(b.m, b.s, 2, { series: ['V1', 'V2'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await estornar(await ultimo(b.m, 'ENTRADA_DEVOLUCAO'));
    await desligar(b.m);
    el = await elegivel(b.m, b.s);
    assert.strictEqual(el.saldo_devolvivel, 2, JSON.stringify(el));
    r = await devolver(b.m, b.s, 2);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(b.m), 2);
    // (c) a saida de material sem serie nunca teve volta: a conta de sempre.
    const c = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 0 WHERE id = ?', [c.id]);
    await mov(c, { tipo: 'ENTRADA', quantidade: 5 });
    const sc = await mov(c, { tipo: 'SAIDA', quantidade: 3 });
    el = await elegivel(c, sc);
    assert.strictEqual(el.saldo_devolvivel, 3);
    assert.strictEqual(el.quantidade_reentrada, 0);
    r = await devolver(c, sc, 4);
    assert.strictEqual(r.body.error, ACIMA_DE_SEMPRE(sc, 3, 0, 3));
  });

  await test('[RN-06] o falso negativo da Fase 2 da 120: volta, estorno da volta (ligada), nova entrada, desliga -> recusa', async () => {
    const { m, s } = await saidaDeDuasSeries();
    const e2 = await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    await estornar(e2); // as series ficam ESTORNADA, fisico 0
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] }); // reativa ESTORNADA: a linha dela nao cita S
    await desligar(m);
    const r = await devolver(m, s, 2);
    assert.strictEqual(r.status, 400, `devolveu em dobro: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, ACIMA(s, 2, 0, 2, 0));
    assert.strictEqual(await fisico(m), 2);
  });

  await test('[RN-06b] declarado: a volta estornada (ligada, sem nova entrada; ou desligada, a C225) continua contando', async () => {
    // O fisico diz que as pecas estao fora — a recusa e conservadora (recusar nunca conta em dobro); o acerto e um Ajuste.
    const a = await saidaDeDuasSeries();
    await estornar(await mov(a.m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] }));
    await desligar(a.m);
    let r = await devolver(a.m, a.s, 2);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(a.s, 2, 0, 2, 0));
    assert.strictEqual(await fisico(a.m), 0);
    const b = await saidaDeDuasSeries();
    const e2 = await mov(b.m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    await desligar(b.m);
    await estornar(e2);
    r = await devolver(b.m, b.s, 2);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(b.s, 2, 0, 2, 0));
    assert.strictEqual(await fisico(b.m), 0);
  });

  await test('[RN-07] a gravacao confere no mesmo comando: a volta que chega entre a validacao e o INSERT recusa', async () => {
    const { m, s } = await saidaDeDuasSeries();
    await desligar(m);
    const [v1, v2] = await idsSeries(m);
    // A linha que a Entrada concorrente gravaria (a entrada citada nao importa: so nao pode ser a de uma devolucao de S).
    const entradaFicticia = await ultimo(m, 'ENTRADA');
    const original = db.run; let armado = true;
    db.run = function (sql, params, cb) {
      if (armado && typeof sql === 'string' && sql.includes('INSERT INTO devolucoes_material_almoxarifado')) {
        armado = false;
        const self = this;
        original.call(db, `INSERT INTO series_entrada_anterior_almoxarifado (serie_id, movimentacao_entrada_id, saida_anterior_id)
          VALUES (?, ?, ?), (?, ?, ?)`, [v1, entradaFicticia, s, v2, entradaFicticia, s], () => original.call(db, sql, params, cb));
        return self;
      }
      return original.call(db, sql, params, cb);
    };
    let r;
    try { r = await devolver(m, s, 2); } finally { db.run = original; }
    assert.ok(!armado, 'o gancho nao disparou');
    assert.strictEqual(r.status, 400, `a gravacao nao conferiu: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, ACIMA(s, 2, 0, 2, 0));
    assert.strictEqual(await devolucoes(m), 0);
    assert.strictEqual(await fisico(m), 0);
  });

  await test('[RN-08] legado: a linha da volta sem a saida (antes da 120) nao e vista — devolve como antes (A68)', async () => {
    const { m, s } = await saidaDeDuasSeries();
    await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
    const limpas = await dbRun(db, `UPDATE series_entrada_anterior_almoxarifado SET saida_anterior_id = NULL
      WHERE serie_id IN (SELECT id FROM series_almoxarifado WHERE material_id = ?)`, [m.id]);
    assert.strictEqual(limpas.changes, 2, 'premissa: a Entrada gravou uma linha por serie');
    await desligar(m);
    assert.strictEqual((await elegivel(m, s)).saldo_devolvivel, 2);
    const r = await devolver(m, s, 2);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fisico(m), 4);
  });

  await test('[RN-04c] (Fase 5, r3) nunca negativo: RETRABALHO das 2 e a volta de V1 -> a lista da 0 e a recusa diz "restam 0"', async () => {
    const { m, s } = await saidaDeDuasSeries();
    let r = await devolver(m, s, 2, { destino: 'RETRABALHO' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['V1'] });
    const el = await elegivel(m, s);
    assert.strictEqual(el.saldo_devolvivel, 0, `saldo negativo publicado: ${JSON.stringify(el)}`);
    r = await devolver(m, s, 1, { series: ['V2'] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, ACIMA(s, 2, 2, 1, 0));
  });

  /**
   * Fase 5 da 121 (r2, I1; B786): a devolucao confere "o que ja voltou" no INSERT, fora da trava do material; as pernas rodavam
   * depois. Uma Entrada das series e o desligar da serie no meio faziam o motor da devolucao rodar sem serie (o controle ja
   * desligado) e creditar de novo: fisico 4 com 2 pecas (20/20 com o gancho; 8/300 sem). Agora as pernas da devolucao para
   * Estoque rodam sob a trava do material e releem ali o controle de serie e o que ja voltou da saida citada. O gancho so
   * segura a resposta do INSERT; os gestos concorrentes partem do contexto do TESTE (regra do CLAUDE.md).
   */
  async function comDevolucaoSegura(m, corpo, noMeio) {
    const original = db.run; let disparou = false; let sinal;
    const gravou = new Promise((res) => { sinal = res; });
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO devolucoes_material_almoxarifado')) {
        disparou = true;
        return original.call(db, sql, params, function (err) { const ctx = this; sinal(); setTimeout(() => cb.call(ctx, err), 60); });
      }
      return original.call(db, sql, params, cb);
    };
    let r;
    try {
      const dev = request(app).post('/api/almoxarifado/devolucoes').send({ material_id: m.id, motivo: 'SOBRA_PROJETO',
        destino: 'ESTOQUE', ...corpo }).then((x) => x);
      await gravou;
      await noMeio();
      r = await dev;
    } finally { db.run = original; }
    assert.ok(disparou, 'gancho do INSERT da devolucao nao disparou');
    return r;
  }
  const MSG_DESLIGOU = (codigo) => `O controle por número de série do material ${codigo} foi desligado enquanto a devolução era `
    + 'gravada — nada foi gravado. Registre a devolução de novo.';
  const MUDOU = (s) => `A saída ${s} mudou enquanto a devolução era gravada — nada foi gravado. Tente de novo.`;

  await test('[RN-09] (Fase 5, r2) devolucao citando S com V1 e V2; a Entrada delas e o desligar no meio -> 400, fisico 2', async () => {
    const { m, s } = await saidaDeDuasSeries();
    const r = await comDevolucaoSegura(m, { quantidade: 2, movimentacao_saida_id: s, series: ['V1', 'V2'] }, async () => {
      await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
      await desligar(m);
    });
    assert.strictEqual(r.status, 400, `creditou em dobro: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, MSG_DESLIGOU(m.codigo));
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await devolucoes(m), 0, 'a linha da devolucao recusada ficou');
    // Repetida (agora sem serie, porque a serie esta desligada), a recusa e a da regua.
    const r2 = await devolver(m, s, 2);
    assert.strictEqual(r2.body.error, ACIMA(s, 2, 0, 2, 0));
  });

  await test('[RN-09b] (Fase 5, r2) devolucao AVULSA com V1; a Entrada de V1 e o desligar no meio -> 400, fisico 1', async () => {
    const { m } = await saidaDeDuasSeries();
    const r = await comDevolucaoSegura(m, { quantidade: 1, series: ['V1'] }, async () => {
      await mov(m, { tipo: 'ENTRADA', quantidade: 1, series: ['V1'] });
      await desligar(m);
    });
    assert.strictEqual(r.status, 400, `creditou em dobro: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, MSG_DESLIGOU(m.codigo));
    assert.strictEqual(await fisico(m), 1);
    assert.strictEqual(await devolucoes(m), 0);
  });

  await test('[RN-09c] (Fase 5, r2) devolucao citando S sem serie (desligada); religa, Entrada V1 V2, desliga no meio -> 400, fisico 2', async () => {
    // Sem serie informada a releitura do controle nao pega; quem pega e a releitura do que ja voltou de S, dentro da trava.
    const { m, s } = await saidaDeDuasSeries();
    await desligar(m);
    const r = await comDevolucaoSegura(m, { quantidade: 2, movimentacao_saida_id: s }, async () => {
      const lig = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: true });
      assert.strictEqual(lig.status, 200, JSON.stringify(lig.body));
      await mov(m, { tipo: 'ENTRADA', quantidade: 2, series: ['V1', 'V2'] });
      await desligar(m);
    });
    assert.strictEqual(r.status, 400, `creditou em dobro: ${JSON.stringify(r.body)} fisico=${await fisico(m)}`);
    assert.strictEqual(r.body.error, MUDOU(s));
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await devolucoes(m), 0);
  });

  await test('[RN-09d] (Fase 5, r2) a Entrada e o desligar logo DEPOIS da releitura esperam a trava: 201 com as series, fisico 2', async () => {
    // Prova a trava, nao a releitura: o gancho segura a resposta da releitura do controle (ja dentro da secao) e os dois gestos
    // partem do contexto do teste. Fora da trava eles entravam antes do motor da devolucao, que creditava sem serie (fisico 4).
    const { m, s } = await saidaDeDuasSeries();
    const original = db.get; let disparou = false; let sinal;
    const releu = new Promise((res) => { sinal = res; });
    db.get = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && sql === 'SELECT controle_serie FROM materiais_almoxarifado WHERE id = ?' && params[0] === m.id) {
        disparou = true;
        return original.call(db, sql, params, (err, row) => { sinal(); setTimeout(() => cb(err, row), 60); });
      }
      return original.call(db, sql, params, cb);
    };
    let r; let entrada; let deslig;
    try {
      const dev = devolver(m, s, 2, { series: ['V1', 'V2'] }).then((x) => x);
      await releu;
      const e = request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 2,
        series: ['V1', 'V2'], motivo: 'dqv121', justificativa: 'dqv121', documento_vinculado: 'NF-DQV121' }).then((x) => x);
      const d = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ controle_serie: false }).then((x) => x);
      r = await dev; entrada = await e; deslig = await d;
    } finally { db.get = original; }
    assert.ok(disparou, 'gancho da releitura nao disparou');
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(entrada.status, 400, `a Entrada das series ja devolvidas passou: ${JSON.stringify(entrada.body)}`);
    assert.strictEqual(deslig.status, 200, JSON.stringify(deslig.body));
    assert.strictEqual(await fisico(m), 2, 'creditou sem serie no meio da devolucao');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
