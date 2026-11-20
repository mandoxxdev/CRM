/**
 * Etapa 259 (D (257) 2) — a exclusao da requisicao devolve as pecas as prateleiras de onde a entrega tirou.
 *
 * A entrega baixa de varias prateleiras (o claim sem origem). A exclusao credita por ENTRADA, uma por saida, com destino = a origem do
 * livro (se aceita) ou a padrao: padrao A 3, B 5, entrega de 6 (A 0, B 2), excluir -> A 6, B 2. Desde a 257 a saida grava as linhas que
 * baixou (`ajuste_linhas_drenadas_almoxarifado`); agora a exclusao credita uma ENTRADA por linha registrada (RN-259.01..07).
 *
 * Cuidado com teste vazio: o 200 da exclusao de antes e o de depois sao iguais, e o total tambem — todo cenario confere as LINHAS.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa259-exclusao-devolve-prateleira.md
 * Executar: cd server && node tests/api/exclusaoDevolvePrateleira.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 259', role: 'admin', is_superadmin: 1, email: 'a259@t.com' },
  ALMOX: { id: 25901, nome: 'Almox 259', role: 'user', email: 'x259@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 259: a exclusao da requisicao devolve as prateleiras de onde a entrega tirou (D (257) 2) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  app.use((req, res, next) => { const k = req.headers['x-u']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  stack.splice(stack.findIndex((l) => l.name === 'jsonParser') + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-u', k).send(b),
    put: (u, b = {}) => request(app).put(u).set('x-u', k).send(b),
    del: (u, b = {}) => request(app).delete(u).set('x-u', k).send(b),
  });
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM259T', nome: 'A259T' });
  const loc = async (codigo) => {
    await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A259T'); const B = await loc('B259T'); const P = await loc('P259T');
  let seq = 0;
  const material = async ({ padrao = P.id, negativo = 0, serie = 0, lote = 0 } = {}) => {
    const c = `EXD259-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,?,?,?,?,1)`,
    [c, c, lote, serie, negativo, padrao])).lastID;
  };
  const v2 = (b) => como('ADMIN').post(`${API}/movimentacoes/v2`, { motivo: 'teste 259', justificativa: 'teste 259', ...b });
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const soma = async (m) => Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id=?',
    [m])).q);
  const entrar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `entrada de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, codigo])).id;
  const sid = async (m, numero) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id=? AND numero=?', [m, numero])).id;
  const novaReq = async (m, q, status = 'APROVADO') => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S',?)`, [`R259T-${++seq}`, status])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    return { R, item };
  };
  /** Requisicao de q, separada e entregue pela rota (a entrega real: o claim sem origem). */
  const entregaReal = async (m, q) => {
    const { R, item } = await novaReq(m, q);
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
    const ent = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: q }] });
    assert.strictEqual(ent.status, 200, `entrega de premissa: ${JSON.stringify(ent.body)}`);
    return R;
  };
  /** A entrega feita como no exclusaoSerieQueVoltou: Saida pelo motor (grava o registro) e o vinculo a requisicao, como a entrega. */
  const entregaPelaSaida = async (m, q, extra = {}) => {
    const { R, item } = await novaReq(m, q, 'ENTREGUE');
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada=?, quantidade_entregue=?, quantidade_atendida=? WHERE id=?',
      [q, q, q, item]);
    const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: q, ...extra });
    assert.strictEqual(s.status, 201, `saida de premissa: ${JSON.stringify(s.body)}`);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [R, s.body.id]);
    return { R, saida: s.body.id };
  };
  const excluir = async (R) => {
    const r = await como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'teste 259' });
    assert.strictEqual(r.status, 200, `exclusao: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const entradasDaExclusao = async (m, R) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, mv.quantidade q
    FROM movimentacoes_almoxarifado mv LEFT JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_destino_id
    WHERE mv.material_id = ? AND mv.requisicao_id = ? AND mv.tipo = 'ENTRADA' ORDER BY mv.id`, [m, R]))
    .map((r) => `${r.loc}=${r.q}`).join(' ');

  // ── RN-259.01: uma ENTRADA por linha registrada ──────────────────────────────────────────────────────────────────────
  await test('[RN-259.01] padrao A 3, B 5, entrega de 6 (A 0, B 2), excluir -> A 3, B 5 (antes: A 6, B 2); uma Entrada por prateleira',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const R = await entregaReal(m, 6);
      assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=2', 'premissa (a entrega)');
      const body = await excluir(R);
      assert.strictEqual(await linhas(m), 'A259T/-=3 B259T/-=5', 'a exclusao nao devolveu a B');
      assert.strictEqual(await fis(m), 8);
      assert.strictEqual(await soma(m), 8);
      assert.strictEqual(await entradasDaExclusao(m, R), '-=3 B259T=3', 'a da padrao vai sem destino no livro, como antes');
      assert.deepStrictEqual(body.estornos, [{ material_id: m, quantidade: 6 }], 'a resposta mudou (estornos por item)');
    });

  await test('[RN-259.01] padrao P vazia, A 4, B 4, entrega de 6 -> excluir -> A 4, B 4, P 0 (antes: P 6)', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 4, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=2', 'premissa');
    await excluir(R);
    assert.strictEqual((await linhas(m)).replace(/ ?P259T\/-=0/, ''), 'A259T/-=4 B259T/-=4');
    assert.strictEqual(await fis(m), 8);
  });

  await test('[RN-259.01, integracao rota] separacao -> entrega -> excluir -> a transferencia de 5 a partir de B (antes: B so tinha 2) sai',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const R = await entregaReal(m, 6);
      await excluir(R);
      const tr = await v2({ material_id: m, tipo: 'TRANSFERENCIA', quantidade: 5, localizacao_origem_id: B.id, localizacao_destino_id: P.id });
      assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
      assert.strictEqual(await linhas(m), 'A259T/-=3 B259T/-=0 P259T/-=5');
    });

  await test('[RN-259.01, servico] requisitionService.excluirRequisicao: o mesmo resultado; total = soma das linhas', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    const r = await requisitionService.excluirRequisicao(db, R, USERS.ADMIN, 'teste 259');
    assert.strictEqual(r.success, true);
    assert.strictEqual(await linhas(m), 'A259T/-=3 B259T/-=5');
    assert.strictEqual(await fis(m), await soma(m));
  });

  await test('[RN-259.01] duas entregas parciais (duas saidas): A 3, B 5, entrega 4 e depois 2 -> excluir -> A 3, B 5', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const { R, item } = await novaReq(m, 6);
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 6 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    for (const q of [4, 2]) {
      // eslint-disable-next-line no-await-in-loop
      const ent = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: q }] });
      assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    }
    assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=2', 'premissa');
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/-=3 B259T/-=5');
  });

  await test('[RN-259.01] com lote: L1 em A 3 e em B 3, saida do lote de 5 -> excluir -> A/L1 3, B/L1 3', async () => {
    const m = await material({ padrao: A.id, lote: 1 });
    await entrar(m, 3, { lote: 'L1' });
    await entrar(m, 3, { lote: 'L1', localizacao_destino_id: B.id });
    const L = await loteId(m, 'L1');
    const { R } = await entregaPelaSaida(m, 5, { lote_id: L });
    assert.strictEqual(await linhas(m), 'A259T/L1=0 B259T/L1=1', 'premissa');
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/L1=3 B259T/L1=3');
  });

  await test('[RN-259.01] a linha do resto (material que permite negativo): A 2, B 1, saida de 5 -> A -2, B 0; excluir -> A 2, B 1',
    async () => {
      const m = await material({ padrao: A.id, negativo: 1 });
      await entrar(m, 2);
      await entrar(m, 1, { localizacao_destino_id: B.id });
      const { R } = await entregaPelaSaida(m, 5);
      assert.strictEqual(await linhas(m), 'A259T/-=-2 B259T/-=0', 'premissa');
      await excluir(R);
      assert.strictEqual(await linhas(m), 'A259T/-=2 B259T/-=1');
      assert.strictEqual(await fis(m), 3);
    });

  // ── RN-259.02: prateleira que nao aceita mais -> o destino de hoje ───────────────────────────────────────────────────
  await test('[RN-259.02, B1607] B bloqueada depois da entrega: a parte de B vai para a padrao A -> A 6, B 2 (a de A volta a A)', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B.id]);
    try {
      await excluir(R);
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [B.id]);
    }
    assert.strictEqual(await linhas(m), 'A259T/-=6 B259T/-=2');
    assert.strictEqual(await entradasDaExclusao(m, R), '-=6', 'partes com o mesmo destino viram uma ENTRADA so');
  });

  await test('[RN-259.02, B1607] A inativa (padrao P): a parte de A vai para a padrao P, a de B volta a B', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 4, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?', [A.id]);
    try {
      await excluir(R);
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET ativo = 1 WHERE id = ?', [A.id]);
    }
    assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=4 P259T/-=4');
  });

  await test('[RN-259.02] a linha registrada que nao existe mais: a parte dela vai para a padrao', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    // so a exclusao do material apaga linha (inalcancavel pelo sistema; a guarda e defensiva) — adulterado no banco
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = 0 WHERE material_id = ? AND localizacao_id = ?', [m, B.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0 WHERE id = ?', [m]);
    await dbRun(db, 'DELETE FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, B.id]);
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/-=6');
  });

  // ── RN-259.03: devolucao parcial ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-259.03, B1608] entrega de 6 (A 3, B 3), devolucao de 2 para Estoque em P, excluir -> A 3, B 3, P 2 (na ordem do claim)',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const { R, saida } = await entregaPelaSaida(m, 6);
      const dv = await como('ADMIN').post(`${API}/devolucoes`, { material_id: m, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
        movimentacao_saida_id: saida, localizacao_id: P.id });
      assert.strictEqual(dv.status, 201, `devolucao de premissa: ${JSON.stringify(dv.body)}`);
      assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=2 P259T/-=2', 'premissa');
      await excluir(R);
      assert.strictEqual(await linhas(m), 'A259T/-=3 B259T/-=3 P259T/-=2');
      assert.strictEqual(await fis(m), 8);
    });

  // ── RN-259.04: serie ────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-259.04] com serie: S1 em A, S2 em B; saida de S1 e S2 -> excluir -> A 1, B 2; S1 em A e S2 em B, em estoque', async () => {
    const m = await material({ padrao: A.id, serie: 1 });
    await entrar(m, 1, { series: ['S1'] });
    await entrar(m, 2, { series: ['S2', 'S3'], localizacao_destino_id: B.id });
    const { R } = await entregaPelaSaida(m, 2, { serie_ids: [await sid(m, 'S1'), await sid(m, 'S2')] });
    assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=1', 'premissa');
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/-=1 B259T/-=2');
    const ser = (await dbAll(db, `SELECT s.numero, s.status, COALESCE(l.codigo,'-') loc FROM series_almoxarifado s
      LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? ORDER BY s.numero`, [m]))
      .map((x) => `${x.numero}:${x.status}:${x.loc}`).join(' ');
    assert.strictEqual(ser, 'S1:EM_ESTOQUE:A259T S2:EM_ESTOQUE:B259T S3:EM_ESTOQUE:B259T');
  });

  await test('[RN-259.04] serie com endereco gravado diferente da linha baixada: cada Entrada leva serie, quantidade = series', async () => {
    const m = await material({ padrao: A.id, serie: 1 });
    await entrar(m, 1, { series: ['T1'] });
    await entrar(m, 1, { series: ['T2'], localizacao_destino_id: B.id });
    // o endereco da serie nao segue a linha (C76/C545): T1 gravada em B, T2 em A
    await dbRun(db, 'UPDATE series_almoxarifado SET localizacao_id = ? WHERE material_id = ? AND numero = ?', [B.id, m, 'T1']);
    await dbRun(db, 'UPDATE series_almoxarifado SET localizacao_id = ? WHERE material_id = ? AND numero = ?', [A.id, m, 'T2']);
    const { R } = await entregaPelaSaida(m, 2, { serie_ids: [await sid(m, 'T1'), await sid(m, 'T2')] });
    assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=0', 'premissa');
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/-=1 B259T/-=1');
    const ser = (await dbAll(db, `SELECT s.numero, s.status, COALESCE(l.codigo,'-') loc FROM series_almoxarifado s
      LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? ORDER BY s.numero`, [m]))
      .map((x) => `${x.numero}:${x.status}:${x.loc}`).join(' ');
    assert.strictEqual(ser, 'T1:EM_ESTOQUE:B259T T2:EM_ESTOQUE:A259T', 'a serie nao foi para a fatia do seu endereco gravado');
  });

  await test('[RN-259.01] registro com menos que a saida (adulterado): o que sobra vai para o destino de hoje (a padrao)', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 4, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    const s = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [R]);
    await dbRun(db, `DELETE FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id = ? AND saldo_id =
      (SELECT id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?)`, [s.id, m, B.id]);
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/-=4 B259T/-=2 P259T/-=2');
    assert.strictEqual(await fis(m), 8);
  });

  // ── RN-259.05: saida sem registro ─────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-259.05] saida sem registro (anterior a 257, ou o registro falhou): como antes — tudo na padrao A (A 6, B 2)', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    await dbRun(db, `DELETE FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id IN
      (SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA')`, [R]);
    await excluir(R);
    assert.strictEqual(await linhas(m), 'A259T/-=6 B259T/-=2');
  });

  // ── RN-259.06: as recusas de sempre, antes da primeira ENTRADA ────────────────────────────────────────────────────────
  await test('[RN-259.06] a recusa do endereco (padrao bloqueada e B bloqueada) vem antes de qualquer ENTRADA: nada entra', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const R = await entregaReal(m, 6);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id IN (?, ?)', [A.id, B.id]);
    let r;
    try {
      r = await como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'teste 259' });
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id IN (?, ?)', [A.id, B.id]);
    }
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/bloqueada/.test(r.body.error), r.body.error);
    assert.strictEqual(await linhas(m), 'A259T/-=0 B259T/-=2');
    assert.strictEqual(await entradasDaExclusao(m, R), '');
    const ativa = await dbGet(db, 'SELECT COALESCE(ativo,1) a FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(Number(ativa.a), 1);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
