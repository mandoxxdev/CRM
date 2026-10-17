/**
 * Etapa 134 (C36, RN-05..RN-07) — decidir inspecao grava a linha da inspecao, e nenhum verbo do motor aparece cru na Auditoria.
 *
 * A C36 dizia que decidir inspecao "nunca gerou linha de auditoria" — a Fase 0 mediu que estava ERRADA: o motor grava
 * `movimentacao / DECISAO_INSPECAO` (quantidade = o retido inteiro, sem aprovado x reprovado, sem o numero da inspecao) e a tela a
 * mostrava com o verbo cru. Agora a decisao grava tambem `inspecao / INSPECAO_DECIDIDA` (com os numeros, em nome de quem decidiu,
 * nao fatal), e os 11 tipos do motor sem rotulo ganham rotulo.
 *
 * RN-07 cruza: aprovacao automatica (C123) -> recebimento retido -> decisao pela rota -> distribuicao -> a tela de Auditoria.
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa134-o-super-do-boot-e-a-trilha.md
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const auditLabels = require('../../services/almoxarifado/auditLabels');
const schema = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 134i', role: 'admin', is_superadmin: 1, email: 'a134i@t.com' };
const QUAL = { id: 13411, nome: 'Qualidade 134', perfil_almoxarifado: 'QUALIDADE', email: 'q134@t.com' };
const SOL = { id: 13412, nome: 'Solicitante 134i', email: 's134i@t.com' };
const API = '/api/almoxarifado';
let seq = 0;

const ROTULOS_NOVOS = {
  RESERVA: 'Reserva', LIBERACAO_RESERVA: 'Liberação de reserva', RETRABALHO: 'Retrabalho', QUARENTENA: 'Quarentena',
  LIBERACAO_INSPECAO: 'Liberação da inspeção', REPROVACAO_INSPECAO: 'Reprovação na inspeção',
  DECISAO_INSPECAO: 'Decisão de inspeção (estoque)', REMESSA_TERCEIRO: 'Remessa a terceiro', RETORNO_TERCEIRO: 'Retorno de terceiro',
  ESTORNO: 'Estorno', AJUSTE_INVENTARIO: 'Ajuste de inventário',
};

(async () => {
  console.log('\n=== Etapa 134 (C36): a decisao de inspecao na Auditoria, e os verbos do motor com rotulo ===\n');

  await test('[RN-06] todo tipo do motor (TIPOS_MOVIMENTO, TIPOS_RETENCAO, TIPOS_DEDICADOS) tem rotulo; os 11 de hoje com o texto do plano', async () => {
    const tipos = [...new Set([...schema.TIPOS_MOVIMENTO, ...schema.TIPOS_RETENCAO, ...schema.TIPOS_DEDICADOS])];
    assert.ok(tipos.length >= 34, `a regua caiu para ${tipos.length} tipos`);
    const crus = tipos.filter((t) => auditLabels.rotularAcao(t) === t);
    assert.deepStrictEqual(crus, [], `tipos do motor sem rotulo: ${JSON.stringify(crus)}`);
    for (const [v, r] of Object.entries(ROTULOS_NOVOS)) assert.strictEqual(auditLabels.rotularAcao(v), r, v);
    assert.strictEqual(auditLabels.rotularAcao('INSPECAO_DECIDIDA'), 'Inspeção decidida');
    assert.strictEqual(auditLabels.rotularEntidade('inspecao'), 'Inspeção');
    assert.deepStrictEqual([...auditLabels.verbosDoGrupo('Inspeção decidida')], ['INSPECAO_DECIDIDA']);
  });

  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [ADMIN, QUAL, SOL]) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('inspecao_material_critico', '1');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');
  const materialCritico = async () => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo,
    material_critico) VALUES (?, ?, 'UN', 0, 1, 1)`, [`E134I-${++seq}`, `Critico 134 ${seq}`])).lastID;
  const itemRetido = async (mat, qtd) => {
    const rec = await receiptService.criarRecebimento(db, ADMIN, { nota_fiscal: `NF-134-${++seq}`, itens: [{ material_id: mat, quantidade: qtd }] });
    await receiptService.aprovarRecebimento(db, ADMIN, rec.id);
    const it = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec.id]);
    return { recId: rec.id, itemId: it.id };
  };
  const linhasDaInspecao = (id) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'inspecao' AND entidade_id = ?
    ORDER BY id`, [id]);
  const todasDaInspecao = () => dbAll(db, "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'inspecao'");
  const decidirPelaRota = async (itemId, body) => {
    setUser({ ...QUAL });
    try { return await request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`).send(body); } finally { setUser({ ...ADMIN }); }
  };

  await test('[RN-05] pela rota: 7 aprovados + 3 reprovados (DEVOLVER) gravam UMA linha da inspecao, com os numeros, em nome de quem decidiu', async () => {
    const mat = await materialCritico();
    const { recId, itemId } = await itemRetido(mat, 10);
    const r = await decidirPelaRota(itemId, { quantidade_aprovada: 7, quantidade_reprovada: 3, encaminhamento: 'DEVOLVER', observacoes: 'riscos na peça' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const ls = await linhasDaInspecao(r.body.id);
    assert.strictEqual(ls.length, 1, JSON.stringify(ls));
    const l = ls[0];
    assert.deepStrictEqual([l.acao, l.usuario_id, l.usuario_nome, l.justificativa], ['INSPECAO_DECIDIDA', QUAL.id, QUAL.nome, 'riscos na peça']);
    assert.deepStrictEqual(JSON.parse(l.dados_novos), {
      recebimento_id: recId, recebimento_item_id: itemId, material_id: mat, quantidade_aprovada: 7, quantidade_reprovada: 3,
      encaminhamento: 'DEVOLVER', conforme: 0, medidas_registradas: 0,
    });
    // a linha do motor continua (e agora com rotulo)
    const mov = await dbAll(db, "SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND acao = 'DECISAO_INSPECAO'");
    assert.ok(mov.length >= 1, 'a linha do motor sumiu');
    const t = await request(app).get(`${API}/auditoria?entidade=inspecao&entidade_id=${r.body.id}`);
    assert.strictEqual(t.status, 200, JSON.stringify(t.body));
    assert.strictEqual(t.body.total, 1);
    assert.deepStrictEqual([t.body.itens[0].entidade_rotulo, t.body.itens[0].acao_rotulo], ['Inspeção', 'Inspeção decidida']);
  });

  await test('[RN-05] pelo servico: aprovacao total grava a linha com conforme 1 e sem encaminhamento', async () => {
    const mat = await materialCritico();
    const { itemId } = await itemRetido(mat, 5);
    const out = await inspectionService.decidirInspecao(db, ADMIN, itemId, { quantidade_aprovada: 5, quantidade_reprovada: 0 });
    const ls = await linhasDaInspecao(out.id);
    assert.strictEqual(ls.length, 1);
    const d = JSON.parse(ls[0].dados_novos);
    assert.deepStrictEqual([d.quantidade_aprovada, d.quantidade_reprovada, d.conforme, d.encaminhamento, ls[0].usuario_id, ls[0].justificativa],
      [5, 0, 1, null, ADMIN.id, null]);
  });

  await test('[RN-05] recusa (conta que nao fecha; item ja decidido): nenhuma linha', async () => {
    const mat = await materialCritico();
    const { itemId } = await itemRetido(mat, 10);
    const antes = (await todasDaInspecao()).length;
    const r = await decidirPelaRota(itemId, { quantidade_aprovada: 4, quantidade_reprovada: 2 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual((await todasDaInspecao()).length, antes, 'a recusa gravou');
    const ok = await decidirPelaRota(itemId, { quantidade_aprovada: 10, quantidade_reprovada: 0 });
    assert.strictEqual(ok.status, 201);
    const de = (await todasDaInspecao()).length;
    const de2 = await decidirPelaRota(itemId, { quantidade_aprovada: 10, quantidade_reprovada: 0 });
    assert.strictEqual(de2.status, 400, JSON.stringify(de2.body));
    assert.strictEqual((await todasDaInspecao()).length, de, 'a segunda decisao gravou');
  });

  await test('[RN-05] a Auditoria indisponivel na hora: 201, a inspecao gravada e o saldo movido', async () => {
    const mat = await materialCritico();
    const { itemId } = await itemRetido(mat, 6);
    const avisos = [];
    const warn = console.warn;
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    await dbRun(db, 'ALTER TABLE auditoria_log_almoxarifado RENAME TO auditoria_log_almoxarifado_fora');
    let r;
    try { r = await decidirPelaRota(itemId, { quantidade_aprovada: 6, quantidade_reprovada: 0 }); } finally {
      await dbRun(db, 'ALTER TABLE auditoria_log_almoxarifado_fora RENAME TO auditoria_log_almoxarifado');
      console.warn = warn;
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const m = await dbGet(db, 'SELECT quantidade_atual, quantidade_em_inspecao FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.deepStrictEqual([Number(m.quantidade_atual), Number(m.quantidade_em_inspecao)], [6, 0]);
    assert.ok(await dbGet(db, 'SELECT id FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [r.body.id]));
    assert.ok(avisos.some((a) => /auditoria do ato falhou \(inspecao \d+, INSPECAO_DECIDIDA\)/.test(a)), `avisos: ${JSON.stringify(avisos)}`);
  });

  await test('[RN-06] pela tela: as opcoes oferecem Quarentena, Decisao de inspecao (estoque) e Inspecao decidida; nenhuma opcao crua', async () => {
    const op = await request(app).get(`${API}/auditoria/opcoes`);
    assert.strictEqual(op.status, 200, JSON.stringify(op.body));
    const rotulos = op.body.acoes.map((a) => a.rotulo);
    for (const r of ['Quarentena', 'Decisão de inspeção (estoque)', 'Inspeção decidida']) assert.ok(rotulos.includes(r), `${r} em ${JSON.stringify(rotulos)}`);
    const crus = op.body.acoes.filter((a) => a.verbos.length === 1 && a.verbos[0] === a.rotulo);
    assert.deepStrictEqual(crus, [], 'opcao com o verbo cru');
    assert.ok(op.body.entidades.some((e) => e.valor === 'inspecao' && e.rotulo === 'Inspeção'));
  });

  await test('[RN-07] integracao: aprovacao automatica sem saldo -> recebimento retido -> decisao pela rota -> a requisicao reservada; a tela mostra as duas linhas', async () => {
    await cfg('aprovacao_automatica', '1');
    try {
      const mat = await materialCritico();
      setUser({ ...SOL });
      let r;
      try { r = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-134', itens: [{ material_id: mat, quantidade: 4 }] }); } finally { setUser({ ...ADMIN }); }
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.deepStrictEqual([r.body.status, r.body.aprovacao], ['AGUARDANDO_ESTOQUE', 'automatica']);
      const { itemId } = await itemRetido(mat, 4);
      const d = await decidirPelaRota(itemId, { quantidade_aprovada: 4, quantidade_reprovada: 0 });
      assert.strictEqual(d.status, 201, JSON.stringify(d.body));
      const st = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [r.body.id]);
      assert.strictEqual(st.status, 'TOTALMENTE_RESERVADA', 'a parte aprovada nao foi para quem esperava');
      const ap = await request(app).get(`${API}/auditoria?entidade=requisicao&entidade_id=${r.body.id}&acao=APROVACAO`);
      assert.strictEqual(ap.body.total, 1, JSON.stringify(ap.body));
      assert.deepStrictEqual([ap.body.itens[0].acao_rotulo, ap.body.itens[0].usuario_nome], ['Aprovação', 'Sistema (automático)']);
      assert.strictEqual(JSON.parse(ap.body.itens[0].dados_novos).status, 'AGUARDANDO_ESTOQUE');
      const ins = await request(app).get(`${API}/auditoria?entidade=inspecao&entidade_id=${d.body.id}`);
      assert.strictEqual(ins.body.total, 1);
      assert.strictEqual(ins.body.itens[0].usuario_nome, QUAL.nome);
      // o filtro "Aprovação" so traz requisicao (a inspecao tem verbo proprio)
      const so = await request(app).get(`${API}/auditoria?acao=APROVACAO&limite=1000`);
      assert.ok(so.body.itens.every((x) => x.entidade === 'requisicao'), JSON.stringify(so.body.itens.map((x) => x.entidade)));
    } finally { await cfg('aprovacao_automatica', '0'); }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
