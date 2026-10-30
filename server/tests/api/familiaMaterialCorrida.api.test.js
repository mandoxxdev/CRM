/**
 * Etapa 110 (C218, B61 de Compras) — cadastrar material e inativar a familia ao mesmo tempo.
 *
 * As duas regras proibem "familia inativa com material ativo": o cadastro recusa familia inativa
 * (`validateFamiliaAtiva`) e o "Inativar" recusa familia com material ativo (`contarItensAtivosDaFamilia`). Mas cada
 * lado conferia e gravava em comandos separados — *write skew*: cada um confere o que o outro esta prestes a mudar.
 * Fase 0 da 110 (30 rodadas, duas requisicoes HTTP juntas): POST x DELETE 30/30 nas duas ordens; PUT de material
 * trocando de familia x DELETE 30/30; POST com subfamilia x DELETE da sub 30/30; POST x PUT de familia {ativo: 0} 6/30.
 *
 * Correcao (RN-06..RN-09 do plano da Etapa 110): a gravacao dos DOIS lados e condicional, num comando SQL so —
 * `INSERT ... SELECT ... WHERE EXISTS (familia ativa)` / `UPDATE ... AND EXISTS (...)` no material, e
 * `UPDATE ... SET ativo = 0 ... AND NOT EXISTS (material ativo) AND NOT EXISTS (sub ativa)` na familia. A conexao
 * SQLite executa um comando inteiro antes ou depois do outro. Quando nao grava, a rota rele e responde a literal de hoje.
 *
 * Duas provas: (1) a janela injetada — o teste embrulha `db.get` e, na conferencia, faz a escrita do OUTRO lado antes
 * de devolver a linha (deterministico); (2) a corrida real pela rota, nas duas ordens.
 *
 * Executar: cd server && node tests/api/familiaMaterialCorrida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const RODADAS = 30;

const L_FAM_INATIVA = 'Família inativa — não é possível vincular novos itens';
const L_SUB = 'Subfamília inválida para a família selecionada';
const L_FAM_NAO = 'Família não encontrada';
const L_ITENS = (n) => `Não é possível remover: família possui ${n} item(ns) ativo(s)`;
const L_SUBS_DEL = (n) => `Não é possível remover: família possui ${n} subfamília(s) ativa(s)`;
const L_SUBS_PUT = 'Não é possível inativar: família possui subfamília(s) ativa(s)';
const E3 = 'A família do material mudou enquanto ele era cadastrado — nada foi gravado. Tente de novo.';
const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material e salve de novo.`;

// SQL exatos das conferencias (lidos do codigo): a injecao casa por eles.
const SQL_CONF_FAMILIA = /^SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/;
const SQL_CONF_SUB = /^SELECT id FROM familias_material_almoxarifado WHERE id = \? AND parent_id = \? AND ativo = 1$/;
const SQL_CONF_SUBS_ATIVAS = /^SELECT COUNT\(\*\) as c FROM familias_material_almoxarifado WHERE parent_id = \? AND ativo = 1$/;

(async () => {
  console.log('\n═══ Corrida da familia: cadastrar material x inativar familia (Etapa 110, C218/B61) ═══\n');
  const { app, db, close } = await createTestApp({ user: SUPER });

  let seq = 0;
  const familia = async (ativo = 1, parentId = null) => {
    seq += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, ?, ?)',
      [`F110-${seq}`, `Familia 110 ${seq}`, ativo, parentId])).lastID;
  };
  const materialDireto = async (familiaId, { sub = null, ativo = 1 } = {}) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, subfamilia_id, ativo)
      VALUES (?, ?, 'PC', ?, ?, ?)`, [`M110-${seq}`, `Material 110 ${seq}`, familiaId, sub, ativo])).lastID;
  };
  const corpo = (familiaId, extra = {}) => {
    seq += 1;
    return { codigo: `C110-${seq}`, nome: `Cadastro 110 ${seq}`, unidade: 'PC', categoria: 'OUTROS', familia_id: familiaId, ...extra };
  };
  const famAtiva = async (id) => Number((await dbGet(db, 'SELECT ativo AS a FROM familias_material_almoxarifado WHERE id = ?', [id])).a);
  const ativosNa = async (id) => (await dbGet(db, `SELECT COUNT(*) AS n FROM materiais_almoxarifado
    WHERE (familia_id = ? OR subfamilia_id = ?) AND ativo = 1`, [id, id])).n;
  const porCodigo = async (codigo) => (await dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE codigo = ?', [codigo])).n;
  const inativarDireto = (id) => () => dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [id]);
  const reativarDireto = (id) => () => dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 1 WHERE id = ?', [id]);

  /* ── Instrumentacao: injecao na janela ─────────────────────────────────────────────────── */
  // Fila de injecoes: cada uma casa um SQL e roda ANTES (`antes`) ou DEPOIS (`depois`) da leitura, uma vez.
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

  /* ── RN-06: o lado do material, POST ───────────────────────────────────────────────────── */
  await test('[RN-06] POST: familia inativada entre a conferencia e a gravacao -> 400 literal de hoje, nada gravado', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(f) });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_FAM_INATIVA);
    assert.strictEqual(await porCodigo(b.codigo), 0);
  });

  await test('[RN-06] POST: subfamilia inativada na janela -> 400 "Subfamília inválida…", nada gravado', async () => {
    const f = await familia(); const sub = await familia(1, f);
    const b = corpo(f, { subfamilia_id: sub });
    injetar({ sql: SQL_CONF_SUB, depois: inativarDireto(sub) });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUB);
    assert.strictEqual(await porCodigo(b.codigo), 0);
  });

  await test('[RN-06] POST: familia apagada na janela -> 400 "Família não encontrada"', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: () => dbRun(db, 'DELETE FROM familias_material_almoxarifado WHERE id = ?', [f]) });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_FAM_NAO);
  });

  await test('[RN-06] POST com codigo que ja existe e familia inativada na janela: a literal da familia, nunca "Código já existe"', async () => {
    const f = await familia();
    const existente = corpo(f);
    assert.strictEqual((await request(app).post('/api/almoxarifado/materiais').send(existente)).status, 201);
    for (const auto of [false, true]) {
      const b = { ...corpo(f), codigo: existente.codigo, codigo_auto: auto };
      const f2 = await familia();
      b.familia_id = f2;
      injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(f2) });
      const r = await request(app).post('/api/almoxarifado/materiais').send(b);
      conferirInjecao(1);
      assert.strictEqual(r.status, 400, `auto=${auto}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, L_FAM_INATIVA, `auto=${auto}`);
      assert.strictEqual(await ativosNa(f2), 0);
    }
  });

  await test('[RN-06] POST com codigo_auto e colisao de codigo: a retentativa continua (familia ativa) e cada tentativa leva a condicao', async () => {
    const f = await familia();
    const primeiro = corpo(f);
    assert.strictEqual((await request(app).post('/api/almoxarifado/materiais').send(primeiro)).status, 201);
    const r = await request(app).post('/api/almoxarifado/materiais').send({ ...corpo(f), codigo: primeiro.codigo, codigo_auto: true });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.notStrictEqual(r.body.codigo, primeiro.codigo);
  });

  await test('[RN-06] POST: familia inativada e reativada na janela -> 201 (o comando ve a familia ativa)', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: async () => { await inativarDireto(f)(); await reativarDireto(f)(); } });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(1);
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
  });

  await test('[RN-06] POST: inativada na janela e reativada antes da releitura -> tenta de novo e grava (201)', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(f) }, { sql: SQL_CONF_FAMILIA, antes: reativarDireto(f) });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(2);
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await porCodigo(b.codigo), 1);
  });

  await test('[RN-06] POST: a familia muda de novo depois da releitura -> a segunda releitura responde a literal de agora (400)', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(f) },
      { sql: SQL_CONF_FAMILIA, antes: reativarDireto(f), depois: inativarDireto(f) });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(2);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_FAM_INATIVA);
    assert.strictEqual(await porCodigo(b.codigo), 0);
  });

  await test('[RN-06] POST: a familia vira duas vezes e as duas releituras a veem ativa -> 409 E3, nada gravado', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(f) },
      { sql: SQL_CONF_FAMILIA, antes: reativarDireto(f), depois: inativarDireto(f) },
      { sql: SQL_CONF_FAMILIA, antes: reativarDireto(f), depois: inativarDireto(f) });
    const r = await request(app).post('/api/almoxarifado/materiais').send(b);
    conferirInjecao(3);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E3);
    assert.strictEqual(await porCodigo(b.codigo), 0);
  });

  await test('[RN-06] pelo servico: createMaterial direto com a familia inativada na janela -> 400 literal (o servico fecha, nao so a rota)', async () => {
    const f = await familia();
    const b = corpo(f);
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(f) });
    let erro = null;
    try { await materialService.createMaterial(db, SUPER, b); } catch (e) { erro = e; }
    conferirInjecao(1);
    assert.ok(erro, 'nao lancou');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, L_FAM_INATIVA);
    assert.strictEqual(await porCodigo(b.codigo), 0);
  });

  /* ── RN-07: o lado do material, PUT ────────────────────────────────────────────────────── */
  await test('[RN-07] PUT troca de familia: a nova inativada na janela -> 400 literal, nada gravado (nem o nome)', async () => {
    const fa = await familia(); const fb = await familia();
    const m = await materialDireto(fa);
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(fb) });
    const r = await request(app).put(`/api/compras/materiais/cadastro/${m}`).send({ familia_id: fb, nome: 'Renomeado 110' });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_FAM_INATIVA);
    const row = await dbGet(db, 'SELECT familia_id, nome FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.strictEqual(row.familia_id, fa);
    assert.notStrictEqual(row.nome, 'Renomeado 110');
  });

  await test('[RN-07] PUT troca de subfamilia: a nova inativada na janela -> 400 "Subfamília inválida…", nada gravado', async () => {
    const f = await familia(); const s1 = await familia(1, f); const s2 = await familia(1, f);
    const m = await materialDireto(f, { sub: s1 });
    injetar({ sql: SQL_CONF_SUB, depois: inativarDireto(s2) });
    const r = await request(app).put(`/api/compras/materiais/cadastro/${m}`).send({ subfamilia_id: s2 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUB);
    assert.strictEqual((await dbGet(db, 'SELECT subfamilia_id AS s FROM materiais_almoxarifado WHERE id = ?', [m])).s, s1);
  });

  await test('[RN-07] PUT: inativada na janela e reativada antes da releitura -> 409 E4 (nada gravado)', async () => {
    const fa = await familia(); const fb = await familia();
    const m = await materialDireto(fa);
    const codigo = (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [m])).codigo;
    injetar({ sql: SQL_CONF_FAMILIA, depois: inativarDireto(fb) }, { sql: SQL_CONF_FAMILIA, antes: reativarDireto(fb) });
    const r = await request(app).put(`/api/compras/materiais/cadastro/${m}`).send({ familia_id: fb });
    conferirInjecao(2);
    assert.strictEqual(r.status, 409, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E4(codigo));
    assert.strictEqual((await dbGet(db, 'SELECT familia_id AS f FROM materiais_almoxarifado WHERE id = ?', [m])).f, fa);
  });

  await test('[RN-07] metade positiva: PUT que nao muda familia grava mesmo com a familia gravada inativa (legado editavel, como hoje)', async () => {
    const f = await familia(0);
    const m = await materialDireto(f);
    const r = await request(app).put(`/api/compras/materiais/cadastro/${m}`).send({ nome: 'Legado editado 110', familia_id: f });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [m])).nome, 'Legado editado 110');
  });

  /* ── RN-08: o lado da familia, DELETE ──────────────────────────────────────────────────── */
  await test('[RN-08] DELETE: material ativo gravado entre a conferencia e a inativacao -> 400 literal dos itens, familia ativa', async () => {
    const f = await familia();
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: () => materialDireto(f) });
    const r = await request(app).delete(`/api/almoxarifado/familias/${f}`);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_ITENS(1));
    assert.strictEqual(await famAtiva(f), 1);
  });

  await test('[RN-08] DELETE da subfamilia: material gravado nela na janela -> 400 literal dos itens, sub ativa', async () => {
    const f = await familia(); const sub = await familia(1, f);
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: () => materialDireto(f, { sub }) });
    const r = await request(app).delete(`/api/almoxarifado/familias/${sub}`);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_ITENS(1));
    assert.strictEqual(await famAtiva(sub), 1);
  });

  await test('[RN-08] DELETE: subfamilia ativa criada na janela -> 400 literal das subfamilias, familia ativa', async () => {
    const f = await familia();
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: () => familia(1, f) });
    const r = await request(app).delete(`/api/almoxarifado/familias/${f}`);
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUBS_DEL(1));
    assert.strictEqual(await famAtiva(f), 1);
  });

  await test('[RN-08] DELETE: inativada por outro na janela -> 200 ja_inativo, sem auditoria EXCLUSAO', async () => {
    const f = await familia();
    const audAntes = (await dbGet(db, `SELECT COUNT(*) AS n FROM auditoria_log_almoxarifado WHERE entidade = 'familia' AND acao = 'EXCLUSAO' AND entidade_id = ?`, [f])).n;
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: inativarDireto(f) });
    const r = await request(app).delete(`/api/almoxarifado/familias/${f}`);
    conferirInjecao(1);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { success: true, ja_inativo: true });
    const audDepois = (await dbGet(db, `SELECT COUNT(*) AS n FROM auditoria_log_almoxarifado WHERE entidade = 'familia' AND acao = 'EXCLUSAO' AND entidade_id = ?`, [f])).n;
    assert.strictEqual(audDepois, audAntes);
  });

  await test('[RN-08] metade positiva: DELETE sem nada na familia inativa (200) e com material INATIVO tambem (200)', async () => {
    const f = await familia();
    await materialDireto(f, { ativo: 0 });
    const r = await request(app).delete(`/api/almoxarifado/familias/${f}`);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { success: true });
    assert.strictEqual(await famAtiva(f), 0);
  });

  /* ── RN-09: o lado da familia, PUT {ativo: 0} ──────────────────────────────────────────── */
  await test('[RN-09] PUT {ativo: 0}: material gravado na janela -> 400 literal dos itens, nada gravado (nem o nome)', async () => {
    const f = await familia();
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: () => materialDireto(f) });
    const r = await request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'Renomeada 110', ativo: 0 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_ITENS(1));
    const row = await dbGet(db, 'SELECT ativo, nome FROM familias_material_almoxarifado WHERE id = ?', [f]);
    assert.strictEqual(Number(row.ativo), 1);
    assert.notStrictEqual(row.nome, 'Renomeada 110');
  });

  await test('[RN-09] PUT {ativo: 0}: subfamilia ativa criada na janela (depois da contagem) -> 400 literal das subfamilias', async () => {
    const f = await familia();
    // a contagem de subs e a 2a leitura do PUT; a injecao roda DEPOIS dela, antes do UPDATE
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: () => familia(1, f) });
    const r = await request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'Renomeada 110 b', ativo: 0 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_SUBS_PUT);
    assert.strictEqual(await famAtiva(f), 1);
  });

  await test('[RN-09] PUT {ativo: 0}: inativada por outro na janela -> 200 e o resto do corpo gravado', async () => {
    const f = await familia();
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: inativarDireto(f) });
    const r = await request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'Renomeada 110 c', ativo: 0 });
    conferirInjecao(1);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(db, 'SELECT ativo, nome FROM familias_material_almoxarifado WHERE id = ?', [f]);
    assert.strictEqual(Number(row.ativo), 0);
    assert.strictEqual(row.nome, 'Renomeada 110 c');
    // Fase 2 (achado 8): a auditoria diz o "de" de agora (ja inativa por outro), nao o lido antes da corrida
    const aud = await dbGet(db, `SELECT dados_anteriores FROM auditoria_log_almoxarifado
      WHERE entidade = 'familia' AND acao = 'EDICAO' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [f]);
    assert.ok(aud, 'sem auditoria EDICAO');
    assert.strictEqual(Number(JSON.parse(aud.dados_anteriores).ativo), 0, aud.dados_anteriores);
  });

  // Fase 5 (rv1 achado 1): o caminho "ja inativada por outro" regravava ativo = 0 SEM condicao.
  // Etapa 123 (C221, Fase 2 I1): a releitura do PUT deixou de ser `relerRecusaDaInativacao` (que so o DELETE usa agora) e
  // passou a ser as MESMAS conferencias da primeira passada — a contagem de subfamilias ativas da releitura e o SQL da
  // primeira (a 2a ocorrencia de SQL_CONF_SUBS_ATIVAS). O cenario e o mesmo: reativada com material novo na releitura.
  const SQL_RELEITURA_SUBS = SQL_CONF_SUBS_ATIVAS;
  await test('[RN-09] PUT {ativo: 0}: inativada por outro e, na releitura, reativada com material novo -> 400 itens; nunca o estado proibido', async () => {
    const f = await familia();
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: inativarDireto(f) },
      { sql: SQL_RELEITURA_SUBS, antes: async () => { await reativarDireto(f)(); await materialDireto(f); } });
    const r = await request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'Renomeada 110 e', ativo: 0 });
    conferirInjecao(2);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L_ITENS(1));
    assert.strictEqual(await famAtiva(f), 1, 'familia inativa com material ativo');
    assert.strictEqual(await ativosNa(f), 1);
  });

  // Fase 5 (rv1 achado 2, anterior a 110): o PUT sem `ativo` regravava o `ativo` lido no inicio.
  await test('[RN-09] PUT so renomeando (sem ativo) nao regrava o ativo: nao desfaz um Inativar concorrente nem reinativa', async () => {
    const f = await familia();
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: inativarDireto(f) });
    const r = await request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'Renomeada 110 g' });
    conferirInjecao(1);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await famAtiva(f), 0, 'o renomear desfez o Inativar concorrente');
    const g = await familia(0);
    injetar({ sql: SQL_CONF_SUBS_ATIVAS, depois: async () => { await reativarDireto(g)(); await materialDireto(g); } });
    const r2 = await request(app).put(`/api/almoxarifado/familias/${g}`).send({ nome: 'Renomeada 110 f' });
    conferirInjecao(1);
    assert.strictEqual(r2.status, 200, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(await famAtiva(g), 1, 'o renomear reinativou a familia com material ativo dentro');
    assert.strictEqual((await dbGet(db, 'SELECT nome FROM familias_material_almoxarifado WHERE id = ?', [g])).nome, 'Renomeada 110 f');
  });

  await test('[RN-09] metade positiva: PUT renomeando sem mexer em ativo grava com material ativo (200)', async () => {
    const f = await familia();
    await materialDireto(f);
    const r = await request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome: 'So renomeada 110' });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await famAtiva(f), 1);
  });

  /* ── RN-10: a corrida real, os quatro pares, nas duas ordens ───────────────────────────── */
  const PARES = [
    ['POST material x DELETE familia', async () => {
      const f = await familia();
      return { alvo: f, a: () => request(app).post('/api/almoxarifado/materiais').send(corpo(f)),
        b: () => request(app).delete(`/api/almoxarifado/familias/${f}`),
        okA: [201], recusaA: [L_FAM_INATIVA], okB: [200], recusaB: [L_ITENS(1)] };
    }],
    ['POST material x PUT familia {ativo: 0}', async () => {
      const f = await familia(); seq += 1; const nome = `Familia 110 put ${seq}`;
      return { alvo: f, a: () => request(app).post('/api/almoxarifado/materiais').send(corpo(f)),
        b: () => request(app).put(`/api/almoxarifado/familias/${f}`).send({ nome, ativo: 0 }),
        okA: [201], recusaA: [L_FAM_INATIVA], okB: [200], recusaB: [L_ITENS(1)] };
    }],
    ['PUT material (troca de familia) x DELETE da nova', async () => {
      const fa = await familia(); const fb = await familia(); const m = await materialDireto(fa);
      return { alvo: fb, a: () => request(app).put(`/api/compras/materiais/cadastro/${m}`).send({ familia_id: fb }),
        b: () => request(app).delete(`/api/almoxarifado/familias/${fb}`),
        okA: [200], recusaA: [L_FAM_INATIVA], okB: [200], recusaB: [L_ITENS(1)] };
    }],
    ['POST material com subfamilia x DELETE da sub', async () => {
      const f = await familia(); const sub = await familia(1, f);
      return { alvo: sub, a: () => request(app).post('/api/almoxarifado/materiais').send(corpo(f, { subfamilia_id: sub })),
        b: () => request(app).delete(`/api/almoxarifado/familias/${sub}`),
        okA: [201], recusaA: [L_SUB], okB: [200], recusaB: [L_ITENS(1)] };
    }],
  ];
  for (const [nome, montar] of PARES) {
    for (const ordem of ['material-primeiro', 'familia-primeiro']) {
      await test(`[RN-10] corrida real ${nome} (${RODADAS} rodadas, ${ordem}): nunca familia inativa com material ativo; recusa so com a literal`, async () => {
        const furos = []; const placar = {};
        for (let i = 0; i < RODADAS; i++) {
          const c = await montar();
          const [ra, rb] = ordem === 'material-primeiro'
            ? await Promise.all([c.a(), c.b()])
            : (await Promise.all([c.b(), c.a()])).reverse();
          const chave = `${ra.status}/${rb.status}`; placar[chave] = (placar[chave] || 0) + 1;
          if (!c.okA.includes(ra.status)) {
            assert.strictEqual(ra.status, 400, `material ${ra.status} ${JSON.stringify(ra.body)}`);
            assert.ok(c.recusaA.includes(ra.body.error), `material recusado com outra mensagem: ${ra.body.error}`);
          }
          if (!c.okB.includes(rb.status)) {
            assert.strictEqual(rb.status, 400, `familia ${rb.status} ${JSON.stringify(rb.body)}`);
            assert.ok(c.recusaB.includes(rb.body.error), `familia recusada com outra mensagem: ${rb.body.error}`);
          }
          if (await famAtiva(c.alvo) !== 1 && await ativosNa(c.alvo) > 0) furos.push(i);
        }
        assert.deepStrictEqual(furos, [], `familia inativa com material ativo nas rodadas ${furos.join(', ')} (placar ${JSON.stringify(placar)})`);
      });
    }
  }

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
