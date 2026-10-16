/**
 * Etapa 123 (C221, B793) — as gravacoes de familia com a conferencia dentro do comando (o molde da C218, Etapa 110).
 *
 * Criar subfamilia, reativar subfamilia e mudar o nivel de uma familia conferiam (pai ativo e raiz; nenhum material;
 * nenhuma subfamilia) e gravavam em comandos separados. Disparadas junto com o "Inativar" da raiz, com o cadastro de
 * material ou com outra reorganizacao, deixavam o que as regras proibem: subfamilia ativa sob raiz inativa, terceiro
 * nivel, material com o par familia/subfamilia que nao bate. Fase 0 (sonda e123fase0): as oito janelas passavam (201/200);
 * pela rota, criar sub x "Inativar" a raiz 18/30 e 22/30, reativar sub x "Inativar" 9/30 e 3/30.
 *
 * Correcao (RN-01..RN-09 do plano da Etapa 123): a condicao vai no proprio INSERT/UPDATE; nao gravou -> a rota rele pelas
 * MESMAS conferencias e responde a literal de hoje; desfeito na janela -> uma tentativa a mais; de novo -> 409.
 *
 * Duas provas: (1) a janela injetada (deterministico); (2) a corrida real pela rota, nas duas ordens.
 *
 * Executar: cd server && node tests/api/familiaHierarquiaCorrida.api.test.js
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
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const RODADAS = 30;

const L_2NIVEIS = 'Subfamília não pode ter filhos (máximo 2 níveis)';
const L_PAI_NAO = 'Família pai não encontrada';
const L_REATIVAR = 'Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes';
const L_VIRAR_SUB = (n) => `Não é possível transformar em subfamília: a família tem ${n} material(is) cadastrado(s) (contando os inativos)`;
const L_MUDAR_RAIZ = (n) => `Não é possível mudar a família principal desta subfamília: ela tem ${n} material(is) cadastrado(s) (contando os inativos)`;
const L_SUBS_ATIVAS = 'Família com subfamília(s) ativa(s) não pode virar subfamília';
const L_SUBS_INATIVAS = 'Família com subfamília(s) inativa(s) não pode virar subfamília — elas ficariam num terceiro nível';
const L_409_POST = 'A família principal mudou enquanto a subfamília era criada — nada foi gravado. Tente de novo.';
const L_409_PUT = 'A família mudou enquanto era salva — nada foi gravado. Recarregue a família e salve de novo.';
const L_ITENS = (n) => `Não é possível remover: família possui ${n} item(ns) ativo(s)`;
const L_SUBS_DEL = (n) => `Não é possível remover: família possui ${n} subfamília(s) ativa(s)`;
const L_FAM_SUB = 'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília';

// SQL exatos das conferencias (lidos do codigo): a injecao casa por eles.
const SQL_PAI = /^SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/;
const SQL_PAI_REATIVACAO = /^SELECT ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/;
const SQL_MATERIAIS = /^SELECT COUNT\(\*\) as c FROM materiais_almoxarifado WHERE familia_id = \? OR subfamilia_id = \?$/;
const SQL_SUBS_ATIVAS = /^SELECT COUNT\(\*\) as c FROM familias_material_almoxarifado WHERE parent_id = \? AND ativo = 1$/;
const SQL_SUBS_INATIVAS = /^SELECT COUNT\(\*\) as c FROM familias_material_almoxarifado WHERE parent_id = \? AND COALESCE\(ativo, 0\) <> 1$/;

(async () => {
  console.log('\n═══ Reorganizacao de familias sem corrida (Etapa 123, C221) ═══\n');
  const { app, db, close } = await createTestApp({ user: SUPER });
  // Fase 5 (r1): um servidor so para o arquivo — supertest com request(app) abre um por requisicao, e nas corridas de 30
  // rodadas em paralelo isso deu EADDRINUSE no Windows sob carga.
  const srv = app.listen(0);

  let seq = 0;
  const familia = async (ativo = 1, parentId = null) => {
    seq += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, ?, ?)',
      [`F123-${seq}`, `Familia 123 ${seq}`, ativo, parentId])).lastID;
  };
  const materialDireto = async (familiaId, sub = null) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, subfamilia_id, ativo)
      VALUES (?, ?, 'PC', ?, ?, 1)`, [`M123-${seq}`, `Material 123 ${seq}`, familiaId, sub])).lastID;
  };
  const linha = (id) => dbGet(db, 'SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = ?', [id]);
  const porNome = async (nome) => (await dbGet(db, 'SELECT COUNT(*) AS n FROM familias_material_almoxarifado WHERE nome = ?', [nome])).n;
  const auditorias = async (id, acao) => (await dbGet(db, `SELECT COUNT(*) AS n FROM auditoria_log_almoxarifado
    WHERE entidade = 'familia' AND entidade_id = ? AND acao = ?`, [id, acao])).n;
  const set = (id, campos) => () => dbRun(db, `UPDATE familias_material_almoxarifado SET ${Object.keys(campos).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(campos), id]);

  /* ── Instrumentacao: injecao na janela (a fila do molde da 110) ───────────────────────── */
  let injecoes = [];
  let rodadas = 0;
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      const ler = () => getOriginal(sql, params, (err, row) => {
        if (!inj.depois) { rodadas++; return cb(err, row); }
        inj.depois().then(() => { rodadas++; cb(err, row); }, (e) => cb(e));
      });
      if (inj.antes) return inj.antes().then(ler, (e) => cb(e));
      return ler();
    }
    return getOriginal(sql, params, cb);
  };
  const injetar = (...lista) => { injecoes = lista; rodadas = 0; };
  const conferirInjecao = (n) => {
    assert.strictEqual(injecoes.length, 0, `injecao nao consumida (a conferencia sumiu? teste vazio): ${injecoes.map((x) => x.sql).join(', ')}`);
    assert.strictEqual(rodadas, n, `injecoes rodadas ${rodadas}, esperado ${n}`);
  };
  const postSub = (nome, parentId) => request(srv).post('/api/almoxarifado/familias').send({ nome, parent_id: parentId });
  const put = (id, corpo) => request(srv).put(`/api/almoxarifado/familias/${id}`).send(corpo);

  /* ── RN-01: criar subfamilia ───────────────────────────────────────────────────────────── */
  await test('[RN-01] criar subfamilia, a raiz inativada na janela -> 400 "maximo 2 niveis", nada gravado', async () => {
    const R = await familia();
    injetar({ sql: SQL_PAI, depois: set(R, { ativo: 0 }) });
    const r = await postSub('sub rn01', R);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_2NIVEIS);
    assert.strictEqual(await porNome('sub rn01'), 0);
  });

  await test('[RN-01b] criar subfamilia, a raiz virou subfamilia na janela -> 400 "maximo 2 niveis"; apagada -> "Família pai não encontrada"', async () => {
    const R = await familia(); const R3 = await familia();
    injetar({ sql: SQL_PAI, depois: set(R, { parent_id: R3 }) });
    const r = await postSub('sub rn01b', R);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_2NIVEIS);
    assert.strictEqual(await porNome('sub rn01b'), 0);
    const R2 = await familia();
    injetar({ sql: SQL_PAI, depois: () => dbRun(db, 'DELETE FROM familias_material_almoxarifado WHERE id = ?', [R2]) });
    const r2 = await postSub('sub rn01b2', R2);
    conferirInjecao(1);
    assert.strictEqual(r2.status, 400, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(r2.body.error, L_PAI_NAO);
    assert.strictEqual(await porNome('sub rn01b2'), 0);
  });

  await test('[RN-01c] criar subfamilia, desfeito na janela (inativada e reativada antes da releitura) -> 201', async () => {
    const R = await familia();
    injetar({ sql: SQL_PAI, depois: set(R, { ativo: 0 }) }, { sql: SQL_PAI, antes: set(R, { ativo: 1 }) });
    const r = await postSub('sub rn01c', R);
    conferirInjecao(2);
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.parent_id, R);
    assert.strictEqual(await porNome('sub rn01c'), 1);
    assert.strictEqual(await auditorias(r.body.id, 'CRIACAO'), 1);
  });

  await test('[RN-01d] criar subfamilia, mudou duas vezes -> 409 literal nova, nada gravado', async () => {
    const R = await familia();
    // a releitura passa duas vezes (desfeito a cada leitura) e as duas gravacoes nao gravam (refeito logo depois)
    const pisca = { sql: SQL_PAI, antes: set(R, { ativo: 1 }), depois: set(R, { ativo: 0 }) };
    injetar({ sql: SQL_PAI, depois: set(R, { ativo: 0 }) }, { ...pisca }, { ...pisca });
    const r = await postSub('sub rn01d', R);
    conferirInjecao(3);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_409_POST);
    assert.strictEqual(await porNome('sub rn01d'), 0);
  });

  /* ── RN-02: reativar subfamilia ────────────────────────────────────────────────────────── */
  await test('[RN-02] reativar subfamilia, a raiz inativada na janela -> 400 literal da reativacao, continua inativa', async () => {
    const R = await familia(); const S = await familia(0, R);
    injetar({ sql: SQL_PAI_REATIVACAO, depois: set(R, { ativo: 0 }) });
    const r = await put(S, { nome: 'sub rn02', ativo: 1 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_REATIVAR);
    assert.strictEqual(Number((await linha(S)).ativo), 0);
    assert.strictEqual(await auditorias(S, 'EDICAO'), 0);
  });

  /* ── RN-03: mudar a subfamilia de raiz ─────────────────────────────────────────────────── */
  await test('[RN-03] subfamilia para a raiz R2, R2 inativada na janela -> 400 "maximo 2 niveis", continua sob a raiz antiga', async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_PAI, depois: set(R2, { ativo: 0 }) });
    const r = await put(S, { nome: 'sub rn03', parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_2NIVEIS);
    assert.strictEqual((await linha(S)).parent_id, R1);
  });

  await test('[RN-03b] subfamilia para a raiz R2, R2 virou subfamilia na janela -> o mesmo 400, sem terceiro nivel', async () => {
    const R1 = await familia(); const R2 = await familia(); const R3 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_PAI, depois: set(R2, { parent_id: R3 }) });
    const r = await put(S, { nome: 'sub rn03b', parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_2NIVEIS);
    assert.strictEqual((await linha(S)).parent_id, R1);
  });

  /* ── RN-04: mudar o nivel x cadastrar material ─────────────────────────────────────────── */
  await test('[RN-04] raiz vira subfamilia, material cadastrado nela na janela -> 400 literal, continua raiz', async () => {
    const X = await familia(); const R2 = await familia();
    injetar({ sql: SQL_MATERIAIS, depois: async () => { await materialDireto(X); } });
    const r = await put(X, { nome: 'x rn04', parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_VIRAR_SUB(1));
    assert.strictEqual((await linha(X)).parent_id, null);
  });

  await test('[RN-04b] subfamilia muda de raiz, material (R1, S) na janela -> 400 literal, continua sob R1', async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_MATERIAIS, depois: async () => { await materialDireto(R1, S); } });
    const r = await put(S, { nome: 's rn04b', parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_MUDAR_RAIZ(1));
    assert.strictEqual((await linha(S)).parent_id, R1);
  });

  await test('[RN-04c] subfamilia vira raiz (parent_id null), material na janela -> o 400 da RN-04b, continua sub', async () => {
    const R1 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_MATERIAIS, depois: async () => { await materialDireto(R1, S); } });
    const r = await put(S, { nome: 's rn04c', parent_id: null });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_MUDAR_RAIZ(1));
    assert.strictEqual((await linha(S)).parent_id, R1);
  });

  /* ── RN-05: raiz vira subfamilia x nasce subfamilia nela ───────────────────────────────── */
  await test('[RN-05] raiz vira subfamilia, nasce subfamilia ATIVA nela na janela -> 400 literal, continua raiz', async () => {
    const X = await familia(); const R2 = await familia();
    injetar({ sql: SQL_SUBS_ATIVAS, depois: async () => { await familia(1, X); } });
    const r = await put(X, { nome: 'x rn05', parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUBS_ATIVAS);
    assert.strictEqual((await linha(X)).parent_id, null);
  });

  await test('[RN-05b] raiz vira subfamilia, nasce subfamilia INATIVA nela na janela das inativas -> 400 literal, continua raiz', async () => {
    const X = await familia(); const R2 = await familia();
    injetar({ sql: SQL_SUBS_INATIVAS, depois: async () => { await familia(0, X); } });
    const r = await put(X, { nome: 'x rn05b', parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUBS_INATIVAS);
    assert.strictEqual((await linha(X)).parent_id, null);
  });

  /* ── RN-06: o PUT que muda duas vezes / desfeito ───────────────────────────────────────── */
  await test('[RN-06] PUT mudar de raiz, mudou duas vezes -> 409 da 110, nada gravado', async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
    const pisca = { sql: SQL_PAI, antes: set(R2, { ativo: 1 }), depois: set(R2, { ativo: 0 }) };
    injetar({ sql: SQL_PAI, depois: set(R2, { ativo: 0 }) }, { ...pisca }, { ...pisca });
    const r = await put(S, { nome: 's rn06', parent_id: R2 });
    conferirInjecao(3);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_409_PUT);
    assert.strictEqual((await linha(S)).parent_id, R1);
  });

  await test('[RN-06b] PUT mudar de raiz, desfeito na janela -> 200, sob R2, com a auditoria', async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_PAI, depois: set(R2, { ativo: 0 }) }, { sql: SQL_PAI, antes: set(R2, { ativo: 1 }) });
    const r = await put(S, { nome: 's rn06b', parent_id: R2 });
    conferirInjecao(2);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await linha(S)).parent_id, R2);
    assert.strictEqual(await auditorias(S, 'EDICAO'), 1);
  });

  /* ── RN-06c: o pai lido (Fase 2, C1) ─────────────────────────────────────────────────── */
  await test("[RN-06c] renomear a subfamilia (so o nome, como a tela) com o pai mudado na janela -> 409, continua sob o pai novo", async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_SUBS_ATIVAS, depois: set(S, { parent_id: R2 }) });
    const r = await put(S, { nome: "s rn06c" });
    conferirInjecao(1);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_409_PUT);
    assert.strictEqual((await linha(S)).parent_id, R2);
    assert.strictEqual(await auditorias(S, "EDICAO"), 0);
    // repetindo o pai lido (sem mudar o nivel): o mesmo
    const R3 = await familia();
    injetar({ sql: SQL_SUBS_ATIVAS, depois: set(S, { parent_id: R3 }) });
    const r2 = await put(S, { nome: "s rn06c2", parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r2.status, 409, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual((await linha(S)).parent_id, R3);
    // metade positiva: sem janela, o renomear grava e o pai fica
    const r3 = await put(S, { nome: "s rn06c3" });
    assert.strictEqual(r3.status, 200, `${r3.status} ${JSON.stringify(r3.body)}`);
    assert.strictEqual((await linha(S)).parent_id, R3);
  });

  await test("[RN-09b] ativo 0 e mudar de raiz no mesmo corpo, a raiz nova inativada na janela -> 400 da raiz (nao o 409)", async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
    injetar({ sql: SQL_PAI, depois: set(R2, { ativo: 0 }) });
    const r = await put(S, { nome: "s rn09b", ativo: 0, parent_id: R2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_2NIVEIS);
    const l = await linha(S);
    assert.strictEqual(Number(l.ativo), 1); assert.strictEqual(l.parent_id, R1);
  });

  /* ── RN-08: as guardas — sem janela, gravam como hoje ──────────────────────────────────── */
  await test('[RN-08] sem janela: criar sub 201, reativar 200, mudar de raiz 200, virar raiz 200, raiz vira sub 200, renomear 200', async () => {
    const R1 = await familia(); const R2 = await familia();
    const c = await postSub('sub rn08', R1);
    assert.strictEqual(c.status, 201, `${c.status} ${JSON.stringify(c.body)}`);
    assert.strictEqual(await auditorias(c.body.id, 'CRIACAO'), 1);
    const S = c.body.id;
    await set(S, { ativo: 0 })();
    const re = await put(S, { nome: 'sub rn08', ativo: 1 });
    assert.strictEqual(re.status, 200, `${re.status} ${JSON.stringify(re.body)}`);
    assert.strictEqual(Number((await linha(S)).ativo), 1);
    const mu = await put(S, { nome: 'sub rn08', parent_id: R2 });
    assert.strictEqual(mu.status, 200, `${mu.status} ${JSON.stringify(mu.body)}`);
    assert.strictEqual((await linha(S)).parent_id, R2);
    const vr = await put(S, { nome: 'sub rn08', parent_id: null });
    assert.strictEqual(vr.status, 200, `${vr.status} ${JSON.stringify(vr.body)}`);
    assert.strictEqual((await linha(S)).parent_id, null);
    const vs = await put(S, { nome: 'sub rn08', parent_id: R1 });
    assert.strictEqual(vs.status, 200, `${vs.status} ${JSON.stringify(vs.body)}`);
    assert.strictEqual((await linha(S)).parent_id, R1);
    const rn = await put(S, { nome: 'sub rn08 renomeada' });
    assert.strictEqual(rn.status, 200, `${rn.status} ${JSON.stringify(rn.body)}`);
    assert.strictEqual((await linha(S)).parent_id, R1);
    assert.strictEqual(await auditorias(S, 'EDICAO'), 5);
  });

  await test('[RN-09] ativo 0 e mudanca de nivel no mesmo corpo, com item ativo: a recusa de itens vem primeiro', async () => {
    const X = await familia(); const R2 = await familia(); await materialDireto(X);
    const r = await put(X, { nome: 'x rn09', ativo: 0, parent_id: R2 });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_ITENS(1));
    const l = await linha(X);
    assert.strictEqual(Number(l.ativo), 1); assert.strictEqual(l.parent_id, null);
  });

  /* ── RN-07: a corrida real pela rota ──────────────────────────────────────────────────── */
  const PARES = [
    ['criar subfamilia x Inativar a raiz', async () => {
      const R = await familia(); seq += 1; const nome = `corr sub ${seq}`;
      return {
        a: () => postSub(nome, R), b: () => request(srv).delete(`/api/almoxarifado/familias/${R}`),
        okA: [201], recusaA: [L_2NIVEIS], okB: [200], recusaB: [L_SUBS_DEL(1)],
        furo: async () => (await porNome(nome)) > 0 && Number((await linha(R)).ativo) !== 1,
      };
    }],
    ['reativar subfamilia x Inativar a raiz', async () => {
      const R = await familia(); const S = await familia(0, R);
      return {
        a: () => put(S, { nome: `re ${S}`, ativo: 1 }), b: () => request(srv).delete(`/api/almoxarifado/familias/${R}`),
        okA: [200], recusaA: [L_REATIVAR], okB: [200], recusaB: [L_SUBS_DEL(1)],
        furo: async () => Number((await linha(S)).ativo) === 1 && Number((await linha(R)).ativo) !== 1,
      };
    }],
    ['raiz vira subfamilia x cadastrar material nela', async () => {
      const X = await familia(); const R2 = await familia(); seq += 1; const codigo = `CORR123-${seq}`;
      return {
        a: () => put(X, { nome: `x ${X}`, parent_id: R2 }),
        b: () => request(srv).post('/api/almoxarifado/materiais').send({ codigo, nome: codigo, unidade: 'PC', categoria: 'OUTROS', familia_id: X }),
        okA: [200], recusaA: [L_VIRAR_SUB(1)], okB: [201], recusaB: [L_FAM_SUB],
        furo: async () => (await linha(X)).parent_id !== null
          && (await dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE familia_id = ?', [X])).n > 0,
      };
    }],
    ["renomear a subfamilia (como a tela) x muda-la de raiz", async () => {
      const R1 = await familia(); const R2 = await familia(); const S = await familia(1, R1);
      const out = {};
      return {
        a: () => put(S, { nome: `ren ${S}` }),
        b: async () => { const x = await put(S, { nome: `mov ${S}`, parent_id: R2 }); out.b = x.status; return x; },
        okA: [200], recusaA: [L_409_PUT], statusRecusaA: 409, okB: [200], recusaB: [],
        furo: async () => out.b === 200 && (await linha(S)).parent_id !== R2,
      };
    }],
  ];
  for (const [nome, montar] of PARES) {
    for (const ordem of ['a-primeiro', 'b-primeiro']) {
      await test(`[RN-07] corrida real ${nome} (${RODADAS} rodadas, ${ordem}): nunca o estado proibido; um dos dois grava; recusa so com a literal`, async () => {
        const furos = []; const placar = {};
        for (let i = 0; i < RODADAS; i++) {
          const c = await montar();
          const [ra, rb] = ordem === 'a-primeiro'
            ? await Promise.all([c.a(), c.b()])
            : (await Promise.all([c.b(), c.a()])).reverse();
          const chave = `${ra.status}/${rb.status}`; placar[chave] = (placar[chave] || 0) + 1;
          if (!c.okA.includes(ra.status)) {
            assert.strictEqual(ra.status, c.statusRecusaA || 400, `a ${ra.status} ${JSON.stringify(ra.body)}`);
            assert.ok(c.recusaA.includes(ra.body.error), `a recusada com outra mensagem: ${ra.body.error}`);
          }
          if (!c.okB.includes(rb.status)) {
            assert.strictEqual(rb.status, 400, `b ${rb.status} ${JSON.stringify(rb.body)}`);
            assert.ok(c.recusaB.includes(rb.body.error), `b recusada com outra mensagem: ${rb.body.error}`);
          }
          assert.ok(c.okA.includes(ra.status) || c.okB.includes(rb.status), `nenhum dos dois gravou (placar ${chave})`);
          if (await c.furo()) furos.push(i);
        }
        assert.deepStrictEqual(furos, [], `estado proibido nas rodadas ${furos.join(', ')} (placar ${JSON.stringify(placar)})`);
      });
    }
  }

  srv.close();
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
