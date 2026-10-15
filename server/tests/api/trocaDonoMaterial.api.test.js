/**
 * Etapa 108 (C213) — trocar o dono de um material com historico exige `ajustar_material_cliente`.
 *
 * Ate a 108 o dono era um campo comum do cadastro (`PUT /materiais/:id`, gate `editar_material`): o Almoxarife, sozinho,
 * tirava o cliente, ajustava como material nosso e devolvia o cliente — a decisao 7 da Etapa 8 inteira contornada. E o
 * livro nao guarda o dono por linha: trocar o dono leva o saldo e o historico de um cliente para o outro.
 * A guarda nova (`ownerRules.assertTrocaDeDonoPermitida`) roda na rota, antes de qualquer escrita (RN-01..RN-07 do plano
 * da Etapa 108).
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/trocaDonoMaterial.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const ownerRules = require('../../services/almoxarifado/ownerRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ROLE_ADMIN = { id: 5, nome: 'Role Admin', role: 'admin', email: 'role@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ADM_MODULO = { id: 7, nome: 'Adm Modulo', role: 'user', email: 'mod@test.com', admin_modulos: ['almoxarifado'],
  perfil_almoxarifado: 'ALMOXARIFE' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

const NOSSO = 'estoque proprio (material nosso)';
const e1 = (codigo, de, para, perfil) => `Trocar o dono do material ${codigo} (de ${de} para ${para}) exige a permissao `
  + `"ajustar_material_cliente" (seu perfil: ${perfil}). O material ja tem saldo ou movimentacao, e a troca leva o saldo `
  + 'e o historico de um dono para o outro - mexe no numero que o cliente vai cobrar.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const A = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Metalurgica Alfa LTDA'])).lastID;
  const B = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Caldeiraria Beta SA'])).lastID;
  const cA = 'cliente Metalurgica Alfa LTDA';
  const cB = 'cliente Caldeiraria Beta SA';

  let seq = 0;
  async function material({ dono = A, qtd = 0, extra = {} } = {}) {
    seq += 1;
    const codigo = `E108-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
      VALUES (?, ?, 'PC', ?, 0, 10, 1, ?)`, [codigo, `Chapa ${seq}`, qtd, dono])).lastID;
    for (const [k, v] of Object.entries(extra)) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    }
    return { id, codigo };
  }
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const lancar = async (body) => {
    const r = await as(SUPER, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send(body));
    assert.strictEqual(r.status, 201, `preparo ${body.tipo}: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const linhaMat = (id) => dbGet(db, 'SELECT proprietario_cliente_id dono, nome, updated_at FROM materiais_almoxarifado WHERE id = ?', [id]);
  const auditorias = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM auditoria_log_almoxarifado')).n;
  const auditoriaTroca = (id) => dbGet(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'material_cliente' AND acao = 'TROCA_DONO' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [id]);

  const SENTIDOS = [
    ['cliente -> nosso', A, null, cA, NOSSO],
    ['nosso -> cliente', null, A, NOSSO, cA],
    ['cliente A -> cliente B', A, B, cA, cB],
  ];

  for (const [nomeU, u, perfil] of [['Almoxarife', ALMOXARIFE, 'ALMOXARIFE'], ['Engenharia', ENGENHARIA, 'ENGENHARIA']]) {
    for (const [sentido, de, para, rDe, rPara] of SENTIDOS) {
      await test(`[RN-01] ${nomeU} troca o dono ${sentido} de material com saldo: 403 E1 e nada muda`, async () => {
        const m = await material({ dono: de, qtd: 10 });
        const antes = await linhaMat(m.id);
        const aud = await auditorias();
        const r = await put(u, m.id, { nome: 'Nome novo', proprietario_cliente_id: para });
        assert.strictEqual(r.status, 403, JSON.stringify(r.body));
        assert.strictEqual(r.body.error, e1(m.codigo, rDe, rPara, perfil));
        assert.deepStrictEqual(await linhaMat(m.id), antes, 'o cadastro foi tocado');
        assert.strictEqual(await auditorias(), aud, 'a recusa gravou auditoria');
      });
    }
  }

  for (const [nomeU, u] of [['Administrador por perfil', ADM_PERFIL], ['superadmin', SUPER], ["role 'admin'", ROLE_ADMIN],
    ['admin do modulo com perfil Almoxarife gravado', ADM_MODULO]]) {
    await test(`[RN-02] ${nomeU} troca o dono nos tres sentidos (200)`, async () => {
      for (const [, de, para] of SENTIDOS) {
        const m = await material({ dono: de, qtd: 10 });
        const r = await put(u, m.id, { proprietario_cliente_id: para });
        assert.strictEqual(r.status, 200, JSON.stringify(r.body));
        assert.strictEqual((await linhaMat(m.id)).dono, para);
      }
    });
  }

  await test('[RN-03] sem historico (total 0, sem retencao, livro vazio): o Almoxarife troca, sem TROCA_DONO', async () => {
    for (const [, de, para] of SENTIDOS) {
      const m = await material({ dono: de, qtd: 0 });
      const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: para });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual((await linhaMat(m.id)).dono, para);
      assert.strictEqual(await auditoriaTroca(m.id), undefined, 'troca sem historico gravou TROCA_DONO');
      const atual = await dbGet(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
        WHERE entidade = 'material' AND acao = 'ATUALIZACAO' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [m.id]);
      assert.ok(atual, 'a ATUALIZACAO de sempre sumiu');
    }
  });

  for (const col of ['quantidade_reservada', 'quantidade_bloqueada', 'quantidade_em_inspecao', 'quantidade_em_terceiros']) {
    await test(`[RN-04] ${col} > 0 com total 0 conta como historico (403)`, async () => {
      const m = await material({ qtd: 0, extra: { [col]: 2 } });
      const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: null });
      assert.strictEqual(r.status, 403, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, e1(m.codigo, cA, NOSSO, 'ALMOXARIFE'));
    });
  }

  await test('[RN-04] total 0 com a entrada estornada (livro so com linhas canceladas e o estorno) conta como historico', async () => {
    const m = await material({ qtd: 0 });
    const ent = await lancar({ material_id: m.id, tipo: 'ENTRADA', quantidade: 5, motivo: 'nf', documento_vinculado: 'NF-1' });
    const rc = await as(SUPER, () => request(app).post(`/api/almoxarifado/movimentacoes/${ent}/cancelar`).send({ motivo: 'errado' }));
    assert.strictEqual(rc.status, 200, JSON.stringify(rc.body));
    const q = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(q.q, 0, 'o preparo deveria zerar o total');
    const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: B });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, cA, cB, 'ALMOXARIFE'));
  });

  await test('[RN-04] uma linha de livro cancelada sozinha (sem saldo) ja conta', async () => {
    const m = await material({ qtd: 0 });
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior,
      motivo, cancelado) VALUES (?, 'ENTRADA', 1, 0, 1, 'legado', 1)`, [m.id]);
    const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: null });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
  });

  await test('[RN-05] mesmo dono (omitido, numero, string) e material nosso com null/"": o Almoxarife edita o resto (200)', async () => {
    const m = await material({ qtd: 10 });
    for (const corpo of [{ nome: 'n1' }, { nome: 'n2', proprietario_cliente_id: A }, { nome: 'n3', proprietario_cliente_id: String(A) }]) {
      const r = await put(ALMOXARIFE, m.id, corpo);
      assert.strictEqual(r.status, 200, `${JSON.stringify(corpo)}: ${JSON.stringify(r.body)}`);
      assert.strictEqual((await linhaMat(m.id)).nome, corpo.nome);
      assert.strictEqual((await linhaMat(m.id)).dono, A);
    }
    const n = await material({ dono: null, qtd: 10 });
    for (const corpo of [{ nome: 'n4', proprietario_cliente_id: null }, { nome: 'n5', proprietario_cliente_id: '' }]) {
      const r = await put(ALMOXARIFE, n.id, corpo);
      assert.strictEqual(r.status, 200, `${JSON.stringify(corpo)}: ${JSON.stringify(r.body)}`);
      assert.strictEqual((await linhaMat(n.id)).nome, corpo.nome);
      assert.strictEqual((await linhaMat(n.id)).dono, null);
    }
    const aud = await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'material_cliente'
      AND entidade_id IN (?, ?)`, [m.id, n.id]);
    assert.strictEqual(aud.n, 0, 'edicao sem troca gravou material_cliente');
  });

  await test('[RN-06] 404 antes; o 403 E1 antes da validacao da familia', async () => {
    const r404 = await put(ALMOXARIFE, 999999, { proprietario_cliente_id: null });
    assert.strictEqual(r404.status, 404, JSON.stringify(r404.body));
    const m = await material({ qtd: 10 });
    const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: null, familia_id: 987654 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, cA, NOSSO, 'ALMOXARIFE'));
    const rAdm = await put(ADM_PERFIL, m.id, { proprietario_cliente_id: null, familia_id: 987654 });
    assert.strictEqual(rAdm.status, 400, `o Administrador deveria cair na validacao da familia: ${JSON.stringify(rAdm.body)}`);
    assert.strictEqual((await linhaMat(m.id)).dono, A, 'a recusa da familia gravou o dono');
  });

  await test('[RN-01] dono gravado que nao existe mais em clientes: a E1 diz "cliente #<id>" sem repetir a palavra', async () => {
    const m = await material({ dono: 99999, qtd: 10 });
    const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: A });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'cliente #99999', cA, 'ALMOXARIFE'));
  });

  await test('[RN-07] a troca autorizada com historico grava TROCA_DONO nomeando os dois lados', async () => {
    const m = await material({ qtd: 10 });
    const r = await put(ADM_PERFIL, m.id, { proprietario_cliente_id: B });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const a = await auditoriaTroca(m.id);
    assert.ok(a, 'sem TROCA_DONO');
    assert.strictEqual(a.usuario_id, ADM_PERFIL.id);
    assert.strictEqual(a.usuario_nome, 'Adm Perfil');
    assert.deepStrictEqual(JSON.parse(a.dados_anteriores),
      { proprietario_cliente_id: A, proprietario_cliente_nome: 'Metalurgica Alfa LTDA' });
    assert.deepStrictEqual(JSON.parse(a.dados_novos),
      { proprietario_cliente_id: B, proprietario_cliente_nome: 'Caldeiraria Beta SA', quantidade_atual: 10 });
    assert.strictEqual(a.justificativa, null);

    const n = await material({ dono: null, qtd: 3 });
    await put(SUPER, n.id, { proprietario_cliente_id: A });
    const an = await auditoriaTroca(n.id);
    assert.deepStrictEqual(JSON.parse(an.dados_anteriores), { proprietario_cliente_id: null, proprietario_cliente_nome: null });
    assert.deepStrictEqual(JSON.parse(an.dados_novos),
      { proprietario_cliente_id: A, proprietario_cliente_nome: 'Metalurgica Alfa LTDA', quantidade_atual: 3 });

    const c = await material({ qtd: 4 });
    await put(SUPER, c.id, { proprietario_cliente_id: null });
    const ac = await auditoriaTroca(c.id);
    assert.deepStrictEqual(JSON.parse(ac.dados_novos), { proprietario_cliente_id: null, proprietario_cliente_nome: null, quantidade_atual: 4 });
  });

  await test('[RN-07] falha ao gravar a TROCA_DONO nao derruba a troca ja gravada', async () => {
    const m = await material({ qtd: 10 });
    const original = ownerRules.auditarTrocaDeDono;
    ownerRules.auditarTrocaDeDono = async () => { throw new Error('disco cheio'); };
    const warn = console.error; console.error = () => {};
    try {
      const r = await put(ADM_PERFIL, m.id, { proprietario_cliente_id: B });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual((await linhaMat(m.id)).dono, B);
    } finally { ownerRules.auditarTrocaDeDono = original; console.error = warn; }
  });

  await test('[RN-07] o verbo novo tem rotulo na trilha de auditoria', async () => {
    const labels = require('../../services/almoxarifado/auditLabels');
    const rotulo = labels.rotularAcao('TROCA_DONO');
    assert.strictEqual(rotulo, 'Troca de dono');
  });

  await test('[RN-09] um salvar que leu o dono antes da troca autorizada nao grava o dono velho de volta (409, nada gravado)', async () => {
    // Fase 5 (revisor 1): o Almoxarife salva o nome (sem a chave do dono) e fica parado entre a leitura e o UPDATE; nesse
    // meio o Administrador passa o material de A para B. Antes, o UPDATE do Almoxarife reescrevia A.
    const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('E108-R9', 'Fam R9', 1)")).lastID;
    const m = await material({ qtd: 3 });
    let pausar = true; let soltar; const solto = new Promise((r) => { soltar = r; });
    let chegou; const chegada = new Promise((r) => { chegou = r; });
    const origGet = db.get;
    db.get = function (sql, params, cb) {
      if (pausar && /FROM familias_material_almoxarifado WHERE id/.test(sql)) {
        pausar = false; chegou();
        solto.then(() => origGet.call(db, sql, params, cb)); return this;
      }
      return origGet.call(db, sql, params, cb);
    };
    try {
      setUser(ALMOXARIFE);
      const pAlmox = request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'editado', familia_id: fam }).then((x) => x);
      await chegada;
      setUser(ADM_PERFIL);
      const rAdm = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ proprietario_cliente_id: B });
      assert.strictEqual(rAdm.status, 200, JSON.stringify(rAdm.body));
      setUser(ALMOXARIFE); soltar();
      const rAl = await pAlmox;
      assert.strictEqual(rAl.status, 409, JSON.stringify(rAl.body));
      assert.strictEqual(rAl.body.error, `O dono do material ${m.codigo} mudou enquanto este cadastro era salvo — nada foi gravado. `
        + 'Recarregue o material e salve de novo.');
    } finally { db.get = origGet; setUser(SUPER); }
    const fim = await linhaMat(m.id);
    assert.strictEqual(fim.dono, B, 'o dono velho voltou');
    assert.notStrictEqual(fim.nome, 'editado', 'o salvar recusado gravou o nome');
  });

  await test('[RN-01] pelo servico: assertTrocaDeDonoPermitida lanca 403 E1 ao Almoxarife e devolve a troca ao Administrador', async () => {
    const m = await material({ qtd: 10 });
    const gravado = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    await assert.rejects(ownerRules.assertTrocaDeDonoPermitida(db, gravado, B, ALMOXARIFE),
      (e) => e.status === 403 && e.message === e1(m.codigo, cA, cB, 'ALMOXARIFE'));
    const t = await ownerRules.assertTrocaDeDonoPermitida(db, gravado, B, ADM_PERFIL);
    assert.deepStrictEqual(t, { deId: A, paraId: B, deNome: 'Metalurgica Alfa LTDA', paraNome: 'Caldeiraria Beta SA',
      comHistorico: true });
    assert.strictEqual(await ownerRules.assertTrocaDeDonoPermitida(db, gravado, String(A), ALMOXARIFE), null);
    assert.strictEqual(await ownerRules.assertTrocaDeDonoPermitida(db, gravado, undefined, ALMOXARIFE), null);
    // Fase 5 (revisor 2, s02/s27): o contrato direto — '' e 0 sao "nosso"; sem historico a troca volta com comHistorico false.
    const nosso = await material({ dono: null, qtd: 10 });
    const gNosso = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [nosso.id]);
    assert.strictEqual(await ownerRules.assertTrocaDeDonoPermitida(db, gNosso, '', ALMOXARIFE), null);
    assert.strictEqual(await ownerRules.assertTrocaDeDonoPermitida(db, gNosso, 0, ALMOXARIFE), null);
    const vazio = await material({ qtd: 0 });
    const gVazio = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [vazio.id]);
    assert.deepStrictEqual(await ownerRules.assertTrocaDeDonoPermitida(db, gVazio, B, ALMOXARIFE),
      { deId: A, paraId: B, deNome: 'Metalurgica Alfa LTDA', paraNome: 'Caldeiraria Beta SA', comHistorico: false });
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
