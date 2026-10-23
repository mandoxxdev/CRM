/**
 * Etapa 189 (T4) — integracao da pre-selecao do "Sai de" pela rota e pelo servico: cadastro -> entrada com lote -> criar e aprovar pela
 * rota -> GET /fila-separacao e GET /requisicoes/:id/sugestao-coleta -> separar do par (o que a janela pre-seleciona) -> entregar sem
 * escolha (o que a janela de entrega manda com a planejada escolhida). O controle historico (separar no automatico, o padrao antes da
 * 189), a dica velha, a planejada pendente (C1/RN-189.03) e o custo das duas rodadas (I1 da Fase 2 da 189, B1262).
 *
 * Usuarios reais por header (molde da 188 T4): S sem perfil cria pela rota; ADMIN superadmin aprova e da entrada; ALMOX separa e entrega.
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa189-lista-de-coleta-e-pre-selecao-do-sai-de.md
 *
 * Executar: cd server && node tests/api/preSelecaoColetaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 189', role: 'admin', is_superadmin: 1, email: 'a189@t.com' },
  S: { id: 18921, nome: 'Solic 189', role: 'user', email: 's189@t.com' },
  ALMOX: { id: 18922, nome: 'Almox 189', role: 'user', email: 'x189@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 189 (T4): integracao da pre-selecao do "Sai de" ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM189I', nome: 'Almox 189 I' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status} ${JSON.stringify(alm.body)}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A01 = await loc('XA-01'); const B01 = await loc('XB-01'); const P01 = await loc('XP-01');

  // Emenda M5 da Fase 2: o material grava a padrao XP-01 (o molde da 188 a deixava nula, e a linha sem lote nascia sem endereco).
  const material = async ({ lote = false, padrao = P01.id } = {}) => {
    const c = `E189I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, localizacao_padrao_id) VALUES (?, ?, 'PC', 0, 0, 1, 0, 0.1, ?, ?)`,
    [c, c, lote ? 1 : 0, padrao])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e189',
      localizacao_destino_id: destino, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const validade = (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE material_id = ? AND codigo = ?',
    [data, m.id, codigo]);
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-189',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    return { R: cr.body.id, ids };
  };
  const separar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: linhas });
  const entregar = (R, linhas) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: linhas });
  const daFila = async (R) => {
    const r = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const f = r.body.find((x) => x.id === R);
    assert.ok(f, `requisicao ${R} na fila`);
    return f;
  };
  const sugestao = async (R) => {
    const r = await como('ALMOX').get(`${API}/requisicoes/${R}/sugestao-coleta`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const saldos = (m) => dbAll(db, `SELECT l.codigo as loc, lt.codigo as lote, s.quantidade FROM estoque_saldo_almoxarifado s
      LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
      WHERE s.material_id = ? ORDER BY s.id`, [m.id]);
  const saldoDe = async (m, locCod, loteCod) => {
    const s = (await saldos(m)).find((x) => x.loc === locCod && x.lote === loteCod);
    return s ? Number(s.quantidade) : null;
  };
  const semLoteNaoZero = async (m) => (await saldos(m)).filter((x) => x.lote == null && Math.abs(Number(x.quantidade)) > 1e-9);
  const trocas = (R) => dbAll(db, `SELECT momento, quantidade, automatica FROM substituicoes_origem_requisicao WHERE requisicao_id = ?
      ORDER BY id`, [R]);
  const planejada = (item) => dbGet(db, `SELECT l.codigo as loc, lt.codigo as lote FROM itens_requisicao_almoxarifado i
      LEFT JOIN localizacoes_almoxarifado l ON l.id = i.origem_separacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id = i.lote_separacao_id
      WHERE i.id = ?`, [item]);

  // L1 (vence antes) 6 em XB-01, L2 9 na padrao XP-01; requisicao de 5.
  const cenarioLote = async () => {
    const m = await material({ lote: true });
    await entrar(m, B01.id, 6, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', '2026-11-10'); await validade(m, 'L2', '2026-12-20');
    const r = await req([[m.id, 5]]);
    return { m, ...r };
  };

  await test('[T4 rota, RN-189.08] fila -> sugestao -> separar o par -> entregar sem escolha: baixa do par, nenhuma linha sem lote, 0 trocas', async () => {
    const { m, R, ids } = await cenarioLote();
    const f = (await daFila(R)).itens[0];
    const s = (await sugestao(R)).itens[0];
    assert.deepStrictEqual(s.pegar_em, f.pegar_em, 'a rota nova devolve o mesmo pegar_em da fila');
    assert.deepStrictEqual([s.pegar_em.localizacao_codigo, s.pegar_em.lote_codigo, s.pegar_em.quantidade_sugerida, s.pegar_em.cobre],
      ['XB-01', 'L1', 5, true]);
    const sep = await separar(R, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: s.pegar_em.localizacao_id,
      lote_id: s.pegar_em.lote_id }]);
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    assert.deepStrictEqual(await planejada(ids[0]), { loc: 'XB-01', lote: 'L1' });
    const en = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 5 }]);
    assert.strictEqual(en.status, 200, JSON.stringify(en.body));
    assert.strictEqual(await saldoDe(m, 'XB-01', 'L1'), 1);
    assert.strictEqual(await saldoDe(m, 'XP-01', 'L2'), 9);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
    assert.deepStrictEqual(await trocas(R), []);
  });

  await test('[T4 rota, controle historico] o mesmo cenario separando SEM chave (o automatico de antes da 189) -> L1 6, L2 9 e a linha sem lote -5 na padrao', async () => {
    const { m, R, ids } = await cenarioLote();
    const sep = await separar(R, [{ item_id: ids[0], quantidade_separada: 5 }]);
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const en = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 5 }]);
    assert.strictEqual(en.status, 200, JSON.stringify(en.body));
    assert.strictEqual(await saldoDe(m, 'XB-01', 'L1'), 6);
    assert.strictEqual(await saldoDe(m, 'XP-01', 'L2'), 9);
    assert.deepStrictEqual(await semLoteNaoZero(m), [{ loc: 'XP-01', lote: null, quantidade: -5 }]);
  });

  await test('[T4 rota, RN-189.07] dica velha: listar a sugestao; saida avulsa de 4 em XB-01/L1; separar 5 do par -> 400 com a literal; sem chave -> 200', async () => {
    const { m, R, ids } = await cenarioLote();
    const s = (await sugestao(R)).itens[0];
    assert.strictEqual(s.pegar_em.localizacao_codigo, 'XB-01', 'premissa');
    const saida = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: 4, motivo: 'e189 velha',
      justificativa: 'e189 dica velha', localizacao_origem_id: B01.id, lote: 'L1' });
    assert.strictEqual(saida.status, 201, `saida: ${JSON.stringify(saida.body)}`);
    const sep = await separar(R, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: s.pegar_em.localizacao_id,
      lote_id: s.pegar_em.lote_id }]);
    assert.strictEqual(sep.status, 400, JSON.stringify(sep.body));
    assert.strictEqual(sep.body.error, `${m.nome}: O saldo em XB-01 (2) não cobre a quantidade (5) — a saída tiraria de outros endereços`);
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[0]]))
      .quantidade_separada || 0), 0, 'nada gravado na recusa');
    const sep2 = await separar(R, [{ item_id: ids[0], quantidade_separada: 5 }]);
    assert.strictEqual(sep2.status, 200, JSON.stringify(sep2.body));
  });

  await test('[T4 servico] sugestaoDeColetaDaRequisicao = a rota = o recorte de listarFilaSeparacao', async () => {
    const { R } = await cenarioLote();
    const m2 = await material();
    await entrar(m2, A01.id, 4);
    const outra = await req([[m2.id, 2]]);
    const user = { ...USERS.ALMOX };
    const peloServico = await requisitionService.sugestaoDeColetaDaRequisicao(db, user, R);
    const pelaRota = await sugestao(R);
    assert.deepStrictEqual(pelaRota, peloServico);
    const daFilaToda = (await requisitionService.listarFilaSeparacao(db, user)).find((x) => x.id === R);
    assert.deepStrictEqual(peloServico, {
      requisicao_id: R,
      itens: daFilaToda.itens.map((i) => ({ item_id: i.item_id, separavel: i.separavel, pegar_em: i.pegar_em, pegar_em_aviso: i.pegar_em_aviso,
        pegar_em_alerta: i.pegar_em_alerta })),
      ordem_coleta: daFilaToda.ordem_coleta,
    });
    assert.notDeepStrictEqual(await requisitionService.sugestaoDeColetaDaRequisicao(db, user, outra.R), peloServico,
      'premissa: a outra requisicao tem outra sugestao');
  });

  await test('[T4 rota, C1/RN-189.03] separou 3 de XA-01: a sugestao e XA-01 com PLANEJADA_NAO_COBRE; separar 1 de XA-01 -> 200, 0 trocas', async () => {
    const m = await material();
    await entrar(m, P01.id, 20); await entrar(m, A01.id, 4); await entrar(m, B01.id, 10);
    const { R, ids } = await req([[m.id, 6]]);
    const s1 = await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A01.id }]);
    assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
    const s = (await sugestao(R)).itens[0];
    assert.deepStrictEqual([s.pegar_em && s.pegar_em.localizacao_codigo, s.pegar_em && s.pegar_em.quantidade_sugerida, s.pegar_em_aviso],
      ['XA-01', 1, 'PLANEJADA_NAO_COBRE']);
    const s2 = await separar(R, [{ item_id: ids[0], quantidade_separada: 1, localizacao_origem_id: A01.id }]);
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    assert.deepStrictEqual(await trocas(R), []);
    assert.deepStrictEqual(await planejada(ids[0]), { loc: 'XA-01', lote: null });
  });

  // ── I1 da Fase 2 da 189 (a sonda f2r189-sonda1): o custo da pre-selecao em duas rodadas (B1262) ───────────────────────────────────
  // So L1 3 em XB-01; requisicao de 6. Rodada 1 com o par sugerido (o que a janela pre-seleciona). Chega L2 3 em XP-01.
  const duasRodadas = async () => {
    const m = await material({ lote: true });
    await entrar(m, B01.id, 3, 'L1');
    const r = await req([[m.id, 6]]);
    const s = (await sugestao(r.R)).itens[0];
    assert.deepStrictEqual([s.pegar_em.localizacao_codigo, s.pegar_em.lote_codigo, s.pegar_em.quantidade_sugerida, s.pegar_em.cobre],
      ['XB-01', 'L1', 3, true], 'premissa: cobre o separavel 3, nao o pedido 6');
    const s1 = await separar(r.R, [{ item_id: r.ids[0], quantidade_separada: 3, localizacao_origem_id: s.pegar_em.localizacao_id,
      lote_id: s.pegar_em.lote_id }]);
    assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
    return { m, ...r };
  };

  await test('[T4 rota, I1 da Fase 2] duas rodadas sem entregar -> 1 troca SEPARACAO automatica e a linha sem lote -6 (o custo da B1262)', async () => {
    const { m, R, ids } = await duasRodadas();
    await entrar(m, P01.id, 3, 'L2');
    const s = (await sugestao(R)).itens[0];
    assert.deepStrictEqual([s.pegar_em, s.pegar_em_aviso], [null, 'PLANEJADA_NAO_COBRE']);
    // a janela (65) abre em automatico com o aviso de troca; confirmar = separar sem chave
    const s2 = await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    const t = await trocas(R);
    assert.deepStrictEqual(t.map((x) => [x.momento, Number(x.quantidade), Number(x.automatica)]), [['SEPARACAO', 3, 1]]);
    const en = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 6 }]);
    assert.strictEqual(en.status, 200, JSON.stringify(en.body));
    assert.strictEqual(await saldoDe(m, 'XB-01', 'L1'), 3);
    assert.strictEqual(await saldoDe(m, 'XP-01', 'L2'), 3);
    assert.deepStrictEqual(await semLoteNaoZero(m), [{ loc: 'XP-01', lote: null, quantidade: -6 }]);
  });

  await test('[T4 rota, I1 da Fase 2] entregando entre as rodadas -> 0 trocas e nenhuma linha sem lote', async () => {
    const { m, R, ids } = await duasRodadas();
    const e1 = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.strictEqual(e1.status, 200, JSON.stringify(e1.body));
    await entrar(m, P01.id, 3, 'L2');
    const s = (await sugestao(R)).itens[0];
    assert.deepStrictEqual([s.pegar_em.localizacao_codigo, s.pegar_em.lote_codigo, s.pegar_em.quantidade_sugerida, s.pegar_em.cobre,
      s.pegar_em_aviso], ['XP-01', 'L2', 3, true, null]);
    const s2 = await separar(R, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: s.pegar_em.localizacao_id,
      lote_id: s.pegar_em.lote_id }]);
    assert.strictEqual(s2.status, 200, JSON.stringify(s2.body));
    const e2 = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3 }]);
    assert.strictEqual(e2.status, 200, JSON.stringify(e2.body));
    assert.deepStrictEqual(await trocas(R), []);
    assert.strictEqual(await saldoDe(m, 'XB-01', 'L1'), 0);
    assert.strictEqual(await saldoDe(m, 'XP-01', 'L2'), 0);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
  });

  // Fase 5 da 189 (achado 2, sonda SONDA-1; C449). Duas janelas: R1 e R2 abrem com a MESMA sugestao XB-01/L1 (6 cobre 4 de cada uma,
  // a fila nao desconta outra requisicao). R1 separa 4 do par; R2 confirma o pre-selecionado com a sugestao velha. A separacao so
  // desconta o separado pendente da PROPRIA requisicao no par (regra da Etapa 59), entao aceita o endereco ja comprometido por R1.
  // A entrega de R2 recusa com a literal da planejada e nada de estoque se perde: a falha e segura. O controle e o automatico de antes
  // da 189: a entrega de R2 passava e deixava a linha sem lote -4 na padrao (pior).
  const duasJanelas = async () => {
    const m = await material({ lote: true });
    await entrar(m, B01.id, 6, 'L1'); await entrar(m, P01.id, 9, 'L2');
    await validade(m, 'L1', '2026-11-10'); await validade(m, 'L2', '2026-12-20');
    const r1 = await req([[m.id, 4]]); const r2 = await req([[m.id, 4]]);
    const s1 = (await sugestao(r1.R)).itens[0].pegar_em; const s2 = (await sugestao(r2.R)).itens[0].pegar_em;
    assert.deepStrictEqual([s1.localizacao_codigo, s1.lote_codigo, s1.cobre, s2.localizacao_codigo, s2.lote_codigo, s2.cobre],
      ['XB-01', 'L1', true, 'XB-01', 'L1', true], 'premissa: as duas janelas recebem o mesmo par');
    const a = await separar(r1.R, [{ item_id: r1.ids[0], quantidade_separada: 4, localizacao_origem_id: s1.localizacao_id, lote_id: s1.lote_id }]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    return { m, r1, r2, s2 };
  };

  await test('[Fase 5, C449] sugestao velha: R2 separa do par ja comprometido por R1 -> 200; a entrega de R2 recusa e nada de estoque se perde', async () => {
    const { m, r1, r2, s2 } = await duasJanelas();
    const b = await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 4, localizacao_origem_id: s2.localizacao_id, lote_id: s2.lote_id }]);
    assert.strictEqual(b.status, 200, `a separacao aceita (regra da 59): ${JSON.stringify(b.body)}`);
    const e1 = await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(e1.status, 200, JSON.stringify(e1.body));
    const e2 = await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(e2.status, 400, JSON.stringify(e2.body));
    assert.strictEqual(e2.body.error, `${m.nome}: a origem da separação (XB-01) não serve mais (O saldo em XB-01 (2) não cobre a `
      + 'quantidade (4) — a saída tiraria de outros endereços) — entregue escolhendo de onde sai');
    assert.strictEqual(await saldoDe(m, 'XB-01', 'L1'), 2);
    assert.strictEqual(await saldoDe(m, 'XP-01', 'L2'), 9);
    assert.deepStrictEqual(await semLoteNaoZero(m), []);
    assert.deepStrictEqual(await trocas(r2.R), []);
  });

  await test('[Fase 5, C449 controle historico] o mesmo com R2 no automatico (antes da 189) -> a entrega de R2 passa e deixa -4 sem lote na padrao', async () => {
    const { m, r1, r2 } = await duasJanelas();
    const b = await separar(r2.R, [{ item_id: r2.ids[0], quantidade_separada: 4 }]);
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual((await entregar(r1.R, [{ item_id: r1.ids[0], quantidade_atendida: 4 }])).status, 200);
    const e2 = await entregar(r2.R, [{ item_id: r2.ids[0], quantidade_atendida: 4 }]);
    assert.strictEqual(e2.status, 200, JSON.stringify(e2.body));
    assert.strictEqual(await saldoDe(m, 'XB-01', 'L1'), 2);
    assert.strictEqual(await saldoDe(m, 'XP-01', 'L2'), 9);
    assert.deepStrictEqual(await semLoteNaoZero(m), [{ loc: 'XP-01', lote: null, quantidade: -4 }]);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
