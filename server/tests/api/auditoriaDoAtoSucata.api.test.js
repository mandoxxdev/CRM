/**
 * Etapa 121 (C252; B784) — RN-13: a Auditoria de um ato ja gravado nao derruba o ato, nas portas de sucateamento, sobra/
 * retalho, devolucao e regularizacao de movimentacao (`audit.registrarAuditoriaDoAto`).
 *
 * Medido (e121m-D): a Auditoria rodava depois do ato e a falha dela respondia 500 com o ato gravado. Repetir duplicava (retalho:
 * origem baixada duas vezes e duas sobras; devolucao avulsa: fisico +6; sucateamento: duas solicitacoes) ou recusava ("transicao
 * invalida", "nao esta pendente"); no destino da sucata o catch da rota apagava do disco o comprovante que a linha ja referencia.
 * E no catch das pernas da devolucao a Auditoria da COMPENSACAO/ESTADO_PARCIAL falhando trocava o 400 do motor ("exige lote")
 * por 500 — e a do ESTADO_PARCIAL ainda pulava o aviso DEVOLUCAO_PARCIAL.
 *
 * Gancho por `entidade` E `acao` (a devolucao e `devolucao`/`CRIACAO`; `serie`/`CRIACAO` e outra e fica fatal, RN-14).
 *
 * Executar: cd server && node tests/api/auditoriaDoAtoSucata.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const U2 = { id: 2, nome: 'Aprovador Dois', role: 'admin', is_superadmin: 1, email: 'a2@test.com' };
const U3 = { id: 3, nome: 'Aprovador Tres', role: 'admin', is_superadmin: 1, email: 'a3@test.com' };
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex');

(async () => {
  const ctx = await createTestApp({ user: SUPER });
  const { app, db, close, setUser } = ctx;
  await dbRun(db, 'UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?',
    ['["almox-121@teste.com"]', 'alertas_estoque_emails']);

  /** O INSERT da Auditoria com `entidade`/`acao` falha uma vez. */
  async function comAuditoriaFalhando(entidade, acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    const warn = console.warn; console.warn = () => {};
    let res;
    try { res = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return res;
  }

  let seq = 0;
  async function material(extra = {}) {
    seq += 1; const codigo = `ADS121-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo) VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  async function entrada(m, quantidade) {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade,
      motivo: 'ads121', justificativa: 'ads121', documento_vinculado: 'NF-ADS121' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
    return r.body.id;
  }
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m.id])).f;
  const n = async (sql, p = []) => (await dbGet(db, sql, p)).n;
  const st = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`;
  const statusSuc = async (id) => (await dbGet(db, 'SELECT status FROM sucateamentos_almoxarifado WHERE id = ?', [id])).status;

  async function solicitar(m, quantidade = 2) {
    setUser(SUPER);
    const r = await request(app).post('/api/almoxarifado/sucateamentos').send({ material_id: m.id, quantidade, justificativa: 'quebrado' });
    assert.strictEqual(r.status, 201, `solicitar: ${st(r)}`);
    return r.body.id;
  }
  async function aprovarAsDuas(id) {
    setUser(U2);
    const a = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-almoxarifado`).send({});
    assert.strictEqual(a.status, 200, `perna 1: ${st(a)}`);
    setUser(U3);
    const b = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-gestao`).send({});
    assert.strictEqual(b.status, 200, `perna 2: ${st(b)}`);
    setUser(SUPER);
  }
  function noDisco(nome) {
    const achados = [];
    const varre = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) varre(p); else if (f.name === nome) achados.push(p);
      }
    };
    varre(ctx.uploadsAlmoxDir); // sem try: diretorio errado tem de quebrar o teste, nao zerar a contagem
    return achados.length;
  }

  console.log('\n=== Etapa 121: a Auditoria do ato (C252) — sucateamento, retalho, devolucao, regularizacao ===\n');

  await test('[RN-13a] solicitar sucateamento com a Auditoria falhando -> 201, UMA solicitacao', async () => {
    const m = await material(); await entrada(m, 10);
    const r = await comAuditoriaFalhando('sucateamento', 'solicitar', () => request(app).post('/api/almoxarifado/sucateamentos')
      .send({ material_id: m.id, quantidade: 2, justificativa: 'quebrado' }));
    assert.strictEqual(r.status, 201, st(r));
    assert.strictEqual(await n('SELECT COUNT(*) n FROM sucateamentos_almoxarifado WHERE material_id = ?', [m.id]), 1);
  });

  await test('[RN-13b] aprovar (a perna que baixa) com a Auditoria falhando -> 200, APROVADO, SUCATA uma vez', async () => {
    const m = await material(); await entrada(m, 20);
    const id = await solicitar(m, 4);
    setUser(U2);
    const p1 = await request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-almoxarifado`).send({});
    assert.strictEqual(p1.status, 200, st(p1));
    setUser(U3);
    const r = await comAuditoriaFalhando('sucateamento', 'aprovar',
      () => request(app).post(`/api/almoxarifado/sucateamentos/${id}/aprovar-gestao`).send({}));
    setUser(SUPER);
    assert.strictEqual(r.status, 200, st(r));
    assert.strictEqual(await statusSuc(id), 'APROVADO');
    assert.strictEqual(await fisico(m), 16);
    assert.strictEqual(await n("SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SUCATA'", [m.id]), 1);
  });

  await test('[RN-13c] rejeitar com a Auditoria falhando -> 200, REJEITADO', async () => {
    const m = await material(); await entrada(m, 10);
    const id = await solicitar(m);
    setUser(U2);
    const r = await comAuditoriaFalhando('sucateamento', 'rejeitar',
      () => request(app).post(`/api/almoxarifado/sucateamentos/${id}/rejeitar`).send({ motivo: 'nao e sucata' }));
    setUser(SUPER);
    assert.strictEqual(r.status, 200, st(r));
    assert.strictEqual(await statusSuc(id), 'REJEITADO');
  });

  await test('[RN-13d] cancelar com a Auditoria falhando -> 200, CANCELADO', async () => {
    const m = await material(); await entrada(m, 10);
    const id = await solicitar(m);
    const r = await comAuditoriaFalhando('sucateamento', 'cancelar',
      () => request(app).post(`/api/almoxarifado/sucateamentos/${id}/cancelar`).send({}));
    assert.strictEqual(r.status, 200, st(r));
    assert.strictEqual(await statusSuc(id), 'CANCELADO');
  });

  await test('[RN-13e] registrar destino VENDIDA com comprovante e a Auditoria falhando -> 200 e o comprovante NO DISCO', async () => {
    const m = await material(); await entrada(m, 10);
    const destino = (id) => request(app).post(`/api/almoxarifado/sucateamentos/${id}/destino`)
      .field('destino', 'VENDIDA').field('valor_venda', '150')
      .attach('comprovante', PNG, { filename: 'c.png', contentType: 'image/png' });
    // Controle (metade positiva): sem falha, a varredura acha o arquivo — prova que ela sabe achar.
    const idOk = await solicitar(m); await aprovarAsDuas(idOk);
    setUser(U2);
    const ok = await destino(idOk);
    assert.strictEqual(ok.status, 200, st(ok));
    const arqOk = (await dbGet(db, 'SELECT comprovante_arquivo a FROM sucateamentos_almoxarifado WHERE id = ?', [idOk])).a;
    assert.ok(arqOk, 'controle sem comprovante gravado');
    assert.strictEqual(noDisco(arqOk), 1, 'controle: a varredura nao achou o comprovante');

    const id = await solicitar(m); await aprovarAsDuas(id);
    setUser(U2);
    const r = await comAuditoriaFalhando('sucateamento', 'registrar_destino', () => destino(id));
    setUser(SUPER);
    assert.strictEqual(r.status, 200, st(r));
    const row = await dbGet(db, 'SELECT status, valor_venda, comprovante_arquivo a FROM sucateamentos_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(row.status, 'VENDIDA');
    assert.strictEqual(row.valor_venda, 150);
    assert.ok(row.a, 'a linha nao referencia o comprovante');
    assert.strictEqual(noDisco(row.a), 1, 'o comprovante que a linha referencia foi apagado do disco');
  });

  await test('[RN-13f] editar sobra com a Auditoria falhando -> 200, observacao gravada', async () => {
    const o = await material(); const ret = await material(); await entrada(o, 20);
    const g = await request(app).post('/api/almoxarifado/sobras/gerar-retalho').send({ material_origem_id: o.id,
      material_retalho_id: ret.id, baixar_original: true, quantidade_baixa: 5, quantidade_retalho: 1 });
    assert.strictEqual(g.status, 201, st(g));
    const sid = (await dbGet(db, 'SELECT id FROM sobras_material_almoxarifado WHERE material_id = ?', [o.id])).id;
    const r = await comAuditoriaFalhando('sobra', 'atualizar',
      () => request(app).put(`/api/almoxarifado/sobras/${sid}`).send({ observacoes: 'obs 121' }));
    assert.strictEqual(r.status, 200, st(r));
    assert.strictEqual((await dbGet(db, 'SELECT observacoes o FROM sobras_material_almoxarifado WHERE id = ?', [sid])).o, 'obs 121');
  });

  await test('[RN-13g] gerar retalho com a Auditoria falhando -> 201, UMA sobra, origem baixada uma vez', async () => {
    const o = await material(); const ret = await material(); await entrada(o, 70);
    const r = await comAuditoriaFalhando('sobra', 'gerar_retalho', () => request(app).post('/api/almoxarifado/sobras/gerar-retalho')
      .send({ material_origem_id: o.id, material_retalho_id: ret.id, baixar_original: true, quantidade_baixa: 30, quantidade_retalho: 1 }));
    assert.strictEqual(r.status, 201, st(r));
    assert.strictEqual(await n('SELECT COUNT(*) n FROM sobras_material_almoxarifado WHERE material_id = ?', [o.id]), 1);
    assert.strictEqual(await fisico(o), 40);
    assert.strictEqual(await fisico(ret), 1);
    assert.strictEqual(await n(`SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id IN (?, ?)
      AND COALESCE(cancelado, 0) = 1`, [o.id, ret.id]), 0, 'a geracao foi estornada');
  });

  await test('[RN-13h] devolucao avulsa de 3 com a Auditoria devolucao/CRIACAO falhando -> 201, fisico +3 uma vez, sem ESTADO_PARCIAL', async () => {
    const m = await material(); await entrada(m, 20);
    const r = await comAuditoriaFalhando('devolucao', 'CRIACAO', () => request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m.id, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' }));
    assert.strictEqual(r.status, 201, st(r));
    assert.strictEqual(await fisico(m), 23);
    assert.strictEqual(await n('SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id]), 1);
    assert.strictEqual(await n("SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'", [m.id]), 1);
    assert.strictEqual(await n(`SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'devolucao' AND acao = 'ESTADO_PARCIAL'
      AND entidade_id IN (SELECT id FROM devolucoes_material_almoxarifado WHERE material_id = ?)`, [m.id]), 0);
  });

  await test('[RN-13i] regularizar movimentacao com a Auditoria falhando -> 200, pendencia baixada', async () => {
    const m = await material(); const id = await entrada(m, 5);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET regularizacao_pendente = 1 WHERE id = ?', [id]);
    const r = await comAuditoriaFalhando('movimentacao', 'REGULARIZACAO',
      () => request(app).put(`/api/almoxarifado/movimentacoes/${id}/regularizar`).send({ centro_custo_id: 7 }));
    assert.strictEqual(r.status, 200, st(r));
    const mov = await dbGet(db, 'SELECT regularizacao_pendente p, centro_custo_id c FROM movimentacoes_almoxarifado WHERE id = ?', [id]);
    assert.deepStrictEqual([mov.p, mov.c], [0, 7]);
  });

  await test('[RN-13j] devolucao recusada pelo motor com a Auditoria da COMPENSACAO falhando -> o 400 original ("exige lote"), linha apagada', async () => {
    const m = await material({ controle_lote: 1 });
    const r = await comAuditoriaFalhando('devolucao', 'COMPENSACAO', () => request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m.id, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' }));
    assert.strictEqual(r.status, 400, st(r));
    assert.ok(/lote/i.test(r.body.error), `nao e o erro do motor: ${r.body.error}`);
    assert.strictEqual(await n('SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id]), 0);
  });

  await test('[RN-13k] devolucao parcial (SUCATA, lote bloqueado na 2a perna) com a Auditoria ESTADO_PARCIAL falhando -> o 400 original e o aviso na fila', async () => {
    // Engenharia do estado parcial: molde de notificacaoDividas (RN-06) — o lote fica BLOQUEADO na 3a leitura, a que a perna
    // SUCATA do motor usa; a ENTRADA_DEVOLUCAO ja foi para o livro.
    const m = await material({ controle_lote: 1 });
    const loteId = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?, ?, 'ATIVO')",
      [m.id, `LOTE-ADS121-${m.id}`])).lastID;
    let chamadas = 0;
    const originalGetLote = lotService.getLote;
    lotService.getLote = async (dbArg, id) => {
      chamadas += 1;
      if (chamadas === 3) await dbRun(dbArg, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [id]);
      return originalGetLote(dbArg, id);
    };
    let r;
    try {
      r = await comAuditoriaFalhando('devolucao', 'ESTADO_PARCIAL', () => request(app).post('/api/almoxarifado/devolucoes')
        .send({ material_id: m.id, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'SUCATA', lote_id: loteId }));
    } finally { lotService.getLote = originalGetLote; }
    assert.strictEqual(r.status, 400, st(r));
    assert.ok(/bloqueado/i.test(r.body.error), `nao e o erro do motor: ${r.body.error}`);
    const dev = await dbGet(db, 'SELECT id FROM devolucoes_material_almoxarifado WHERE material_id = ?', [m.id]);
    assert.ok(dev, 'a linha da devolucao parcial tinha de ficar');
    assert.strictEqual(await n(`SELECT COUNT(*) n FROM fila_notificacoes_almoxarifado WHERE evento = 'DEVOLUCAO_PARCIAL'
      AND payload LIKE ?`, [`%"devolucao_id":${dev.id}%`]), 1, 'o aviso DEVOLUCAO_PARCIAL nao foi para a fila');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
