/**
 * Etapa 134 (C123, RN-04) — a aprovacao automatica grava a linha *Aprovacao* na Auditoria.
 *
 * Ate a 133 a requisicao aprovada sozinha guardava `aprovador_nome 'Sistema (automático)'` e a data, a reserva deixava a linha do
 * motor (`movimentacao / RESERVA`), mas a Auditoria nao tinha `requisicao / APROVACAO` (medido na Fase 0: 0 linhas). Agora, quando
 * `tentarAprovacaoAutomatica` grava o status, grava tambem a linha — `usuario_id` nulo, `usuario_nome 'Sistema (automático)'`, quem
 * enviou nos dados — depois de soltar a trava, nao fatal. Pelas duas portas: `POST /requisicoes` e `POST /requisicoes/:id/enviar`.
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa134-o-super-do-boot-e-a-trilha.md
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 134', role: 'admin', is_superadmin: 1, email: 'a134@t.com' };
const SOL = { id: 13401, nome: 'Solicitante 134', email: 's134@t.com' }; // sem perfil: PRODUCAO (requisita)
const API = '/api/almoxarifado';
const SISTEMA = 'Sistema (automático)';
let seq = 0;

(async () => {
  console.log('\n=== Etapa 134 (C123): a aprovacao automatica grava a linha Aprovacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1), (?,?,?,1)',
    [ADMIN.id, ADMIN.nome, ADMIN.email, SOL.id, SOL.nome, SOL.email]);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  const material = async (qtd) => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES (?, ?, 'UN', ?, 1)`, [`E134A-${++seq}`, `Mat 134 ${seq}`, qtd])).lastID;
  const criar = async (m, qtd, extra = {}) => {
    setUser({ ...SOL });
    try {
      return await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-134', itens: [{ material_id: m, quantidade: qtd }], ...extra });
    } finally { setUser({ ...ADMIN }); }
  };
  const linhas = (id) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'requisicao' AND entidade_id = ?
    AND acao = 'APROVACAO' ORDER BY id`, [id]);
  const conferirLinha = (l, id, status) => {
    assert.deepStrictEqual([l.entidade, Number(l.entidade_id), l.acao, l.usuario_id, l.usuario_nome], ['requisicao', id, 'APROVACAO', null, SISTEMA]);
    const d = JSON.parse(l.dados_novos);
    assert.strictEqual(d.status, status);
    assert.strictEqual(d.aprovacao, 'automatica');
    assert.deepStrictEqual([d.enviado_por_id, d.enviado_por_nome], [SOL.id, SOL.nome]);
    assert.ok(Array.isArray(d.reservas), 'reservas na linha');
    return d;
  };

  await cfg('aprovacao_automatica', '1');

  await test('[RN-04] POST /requisicoes com saldo: 201 automatica e UMA linha Aprovacao do sistema, com status e reservas', async () => {
    const m = await material(10);
    const r = await criar(m, 4);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual([r.body.status, r.body.aprovacao], ['TOTALMENTE_RESERVADA', 'automatica']);
    const ls = await linhas(r.body.id);
    assert.strictEqual(ls.length, 1, `linhas: ${JSON.stringify(ls)}`);
    const d = conferirLinha(ls[0], r.body.id, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(d.reservas.length, 1);
    const req = await dbGet(db, 'SELECT aprovador_nome FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(req.aprovador_nome, SISTEMA, 'o nome da linha e o da requisicao');
  });

  await test('[RN-04] POST /requisicoes sem saldo: a linha diz AGUARDANDO_ESTOQUE', async () => {
    const m = await material(0);
    const r = await criar(m, 3);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aprovacao, 'automatica');
    const ls = await linhas(r.body.id);
    assert.strictEqual(ls.length, 1);
    conferirLinha(ls[0], r.body.id, r.body.status);
    assert.strictEqual(r.body.status, 'AGUARDANDO_ESTOQUE');
  });

  await test('[RN-04] POST /requisicoes/:id/enviar (o rascunho): 200 automatica e a linha', async () => {
    const m = await material(10);
    const rasc = await criar(m, 2, { salvar_rascunho: true });
    assert.strictEqual(rasc.body.status, 'RASCUNHO', 'premissa: rascunho');
    assert.strictEqual((await linhas(rasc.body.id)).length, 0, 'o rascunho nao aprova');
    setUser({ ...SOL });
    let r;
    try { r = await request(app).post(`${API}/requisicoes/${rasc.body.id}/enviar`).send({}); } finally { setUser({ ...ADMIN }); }
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.aprovacao, 'automatica');
    const ls = await linhas(rasc.body.id);
    assert.strictEqual(ls.length, 1);
    conferirLinha(ls[0], rasc.body.id, 'TOTALMENTE_RESERVADA');
  });

  await test('[RN-04] sem aprovacao automatica, e com urgencia CRITICO: PENDENTE e nenhuma linha', async () => {
    const m = await material(10);
    const crit = await criar(m, 1, { urgencia: 'CRITICO' });
    assert.strictEqual(crit.status, 201, JSON.stringify(crit.body));
    assert.strictEqual(crit.body.status, 'PENDENTE');
    assert.strictEqual((await linhas(crit.body.id)).length, 0, 'CRITICO gravou Aprovacao');
    await cfg('aprovacao_automatica', '0');
    try {
      const r = await criar(m, 1);
      assert.strictEqual(r.body.status, 'PENDENTE');
      assert.strictEqual((await linhas(r.body.id)).length, 0, 'sem a configuracao gravou Aprovacao');
    } finally { await cfg('aprovacao_automatica', '1'); }
  });

  await test('[RN-04] a Auditoria indisponivel na hora: 201 automatica, a requisicao aprovada (a falha so no log)', async () => {
    const m = await material(10);
    const avisos = [];
    const warn = console.warn;
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    await dbRun(db, 'ALTER TABLE auditoria_log_almoxarifado RENAME TO auditoria_log_almoxarifado_fora');
    let r;
    try { r = await criar(m, 2); } finally {
      await dbRun(db, 'ALTER TABLE auditoria_log_almoxarifado_fora RENAME TO auditoria_log_almoxarifado');
      console.warn = warn;
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual([r.body.status, r.body.aprovacao], ['TOTALMENTE_RESERVADA', 'automatica']);
    const req = await dbGet(db, 'SELECT status, aprovador_nome FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual([req.status, req.aprovador_nome], ['TOTALMENTE_RESERVADA', SISTEMA]);
    assert.ok(avisos.some((a) => /auditoria do ato falhou \(requisicao \d+, APROVACAO\)/.test(a)), `avisos: ${JSON.stringify(avisos)}`);
    assert.strictEqual((await linhas(r.body.id)).length, 0);
  });

  await test('[RN-04] pela tela: o filtro Aprovacao traz a linha com o rotulo; as opcoes nao ganham usuario sem id', async () => {
    const m = await material(10);
    const r = await criar(m, 1);
    const t = await request(app).get(`${API}/auditoria?entidade=requisicao&entidade_id=${r.body.id}&acao=APROVACAO`);
    assert.strictEqual(t.status, 200, JSON.stringify(t.body));
    assert.strictEqual(t.body.total, 1);
    assert.deepStrictEqual([t.body.itens[0].acao_rotulo, t.body.itens[0].entidade_rotulo, t.body.itens[0].usuario_nome],
      ['Aprovação', 'Requisição', SISTEMA]);
    const op = await request(app).get(`${API}/auditoria/opcoes`);
    assert.strictEqual(op.status, 200);
    assert.ok(op.body.usuarios.every((u) => u.id !== null && u.nome !== SISTEMA), JSON.stringify(op.body.usuarios));
    assert.ok(op.body.acoes.some((a) => a.rotulo === 'Aprovação' && a.verbos.includes('APROVACAO')));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
