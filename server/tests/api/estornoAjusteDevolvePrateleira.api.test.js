/**
 * Etapa 256 (C549) — o estorno do Ajuste sem localizacao devolve as pecas as prateleiras de onde a baixa saiu.
 *
 * O AJUSTE sem localizacao define o TOTAL; para baixo, o `drenar` (Etapas 51, 253, 254) tira de outras prateleiras. O estorno nao sabia
 * de onde a baixa saiu: punha o total de volta e o residuo inteiro na posicao padrao — padrao A com 4 separadas e B 3, Ajuste para 4 ->
 * A 4, B 0; estorno -> A 7, B 0 (B1597). Agora a ida grava as linhas drenadas (`ajuste_linhas_drenadas_almoxarifado`) e o estorno as
 * devolve primeiro, limitado ao que iria a mais para a padrao (RN-256.01..06).
 *
 * Cuidado com teste vazio: o 200 do estorno de antes e o de depois sao iguais — todo cenario confere as LINHAS.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa256-estorno-ajuste-devolve-prateleira.md
 * Executar: cd server && node tests/api/estornoAjusteDevolvePrateleira.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
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
  ADMIN: { id: 1, nome: 'Adm 256', role: 'admin', is_superadmin: 1, email: 'a256@t.com' },
  ALMOX: { id: 25601, nome: 'Almox 256', role: 'user', email: 'x256@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 256: o estorno do Ajuste devolve as prateleiras de onde a baixa saiu (C549) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  app.use((req, res, next) => { const k = req.headers['x-u']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  stack.splice(stack.findIndex((l) => l.name === 'jsonParser') + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-u', k).send(b),
    put: (u, b = {}) => request(app).put(u).set('x-u', k).send(b),
  });
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM256T', nome: 'A256T' });
  const loc = async (codigo) => {
    await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A256T'); const B = await loc('B256T'); const P = await loc('P256T');
  let seq = 0;
  const material = async ({ padrao = P.id } = {}) => {
    const c = `EAJ256-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,0,0,?,1)`,
    [c, c, padrao])).lastID;
  };
  const v2 = (b) => como('ADMIN').post(`${API}/movimentacoes/v2`, { motivo: 'teste 256', justificativa: 'teste 256', ...b });
  const cancelar = (id) => como('ADMIN').post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'teste 256' });
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const registro = async (movId) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, d.quantidade q
    FROM ajuste_linhas_drenadas_almoxarifado d JOIN estoque_saldo_almoxarifado s ON s.id = d.saldo_id
    LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id
    WHERE d.movimentacao_id = ? ORDER BY d.id`, [movId])).map((r) => `${r.loc}/${r.lote}=${r.q}`).join(' ');
  const entrar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `entrada de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const ajustar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `ajuste de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const separar = async (m, q, origem, lote = undefined) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S','APROVADO')`, [`R256T-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item,
      quantidade_separada: q, localizacao_origem_id: origem, ...(lote ? { lote_id: lote } : {}) }] });
    assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
    return { R, item };
  };
  const entregar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`,
    { itens_atendidos: [{ item_id: item, quantidade_atendida: q }] });
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, codigo])).id;

  // ── RN-256.01: a ida grava o que drenou ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-256.01] o Ajuste que drenou grava cada prateleira e quanto, na ordem; as linhas da ida sao as de sempre', async () => {
    const m = await material();
    await entrar(m, 30, { localizacao_destino_id: A.id });
    await entrar(m, 20, { localizacao_destino_id: B.id });
    const aj = await ajustar(m, 5);
    assert.strictEqual(await linhas(m), 'A256T/-=0 B256T/-=5 P256T/-=0', 'a ida mudou (Etapa 51)');
    assert.strictEqual(await registro(aj), 'A256T/-=30 B256T/-=15');
  });

  await test('[RN-256.01] o Ajuste que nao drenou (para cima, ou so a padrao) e o AJUSTE_INVENTARIO nao gravam nada', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 6);
    await entrar(m, 3, { localizacao_destino_id: B.id });
    const cima = await ajustar(m, 12);
    const so = await ajustar(m, 10); // a padrao absorve (12 -> 10: A 9 -> 7)
    assert.strictEqual(await linhas(m), 'A256T/-=7 B256T/-=3', 'premissa');
    const inv = await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'AJUSTE_INVENTARIO', quantidade: 1, motivo: 'conferencia', justificativa: 'conferencia' });
    // 10 -> 1: a padrao A iria a -2; o drenar tira 2 de B ate a padrao chegar a 0 (Etapa 51).
    assert.strictEqual(await linhas(m), 'A256T/-=0 B256T/-=1', 'premissa: a contagem drenou B');
    const n = await dbGet(db, 'SELECT COUNT(*) n FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id IN (?,?,?)',
      [cima, so, inv.id]);
    assert.strictEqual(Number(n.n), 0);
  });

  // ── RN-256.02: o estorno devolve as prateleiras ─────────────────────────────────────────────────────────────────────────
  await test('[RN-256.02] C549: padrao A com 4 separadas e B 3, Ajuste para 4, estorno -> A 4, B 3 (antes: A 7, B 0); a entrega sai',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 4);
      await entrar(m, 3, { localizacao_destino_id: B.id });
      const { R, item } = await separar(m, 4, A.id);
      const aj = await ajustar(m, 4);
      assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=0', 'premissa');
      const est = await cancelar(aj);
      assert.strictEqual(est.status, 200, JSON.stringify(est.body));
      assert.strictEqual(await fis(m), 7);
      assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=3', 'o estorno nao devolveu a B');
      const ent = await entregar(R, item, 4);
      assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
      assert.strictEqual(await linhas(m), 'A256T/-=0 B256T/-=3');
    });

  await test('[RN-256.02] sem caixa (Etapa 51): P padrao, A 30, B 20, Ajuste para 5, estorno -> A 30, B 20, P 0', async () => {
    const m = await material();
    await entrar(m, 30, { localizacao_destino_id: A.id });
    await entrar(m, 20, { localizacao_destino_id: B.id });
    const aj = await ajustar(m, 5);
    const est = await cancelar(aj);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await fis(m), 50);
    assert.strictEqual(await linhas(m), 'A256T/-=30 B256T/-=20 P256T/-=0');
  });

  await test('[RN-256.02] com lote: padrao A, LB 4 separadas em A e LB 3 em B, Ajuste do LB para 4, estorno -> A 4, B 3', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4, { lote: 'LB' });
    await entrar(m, 3, { lote: 'LB', localizacao_destino_id: B.id });
    const LB = await loteId(m, 'LB');
    await separar(m, 4, A.id, LB);
    const aj = await ajustar(m, 4, { lote_id: LB });
    assert.strictEqual(await linhas(m), 'A256T/LB=4 B256T/LB=0', 'premissa');
    const est = await cancelar(aj);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await linhas(m), 'A256T/LB=4 B256T/LB=3', 'o estorno com lote nao devolveu a B');
  });

  await test('[RN-256.02, servico] pelo servico (registrarMovimentacao + cancelarMovimentacao) o mesmo resultado', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4);
    await entrar(m, 3, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    const aj = await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'AJUSTE', quantidade: 4, motivo: 'teste 256', justificativa: 'teste 256' });
    assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=0', 'premissa');
    await stockService.cancelarMovimentacao(db, USERS.ADMIN, aj.id, 'teste 256');
    assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=3');
  });

  // ── RN-256.03: o limite — a padrao nao desce por causa da devolucao ───────────────────────────────────────────────────────
  await test('[RN-256.03] Entrada na padrao entre o Ajuste e o estorno: devolve so o que iria a mais para a padrao (A 3, B 2, P 3)',
    async () => {
      const m = await material();
      await entrar(m, 5, { localizacao_destino_id: A.id });
      await entrar(m, 3, { localizacao_destino_id: B.id });
      const aj = await ajustar(m, 2);
      assert.strictEqual(await linhas(m), 'A256T/-=0 B256T/-=2 P256T/-=0', 'premissa');
      await entrar(m, 3); // cai na padrao P
      const est = await cancelar(aj);
      assert.strictEqual(est.status, 200, JSON.stringify(est.body));
      // O estorno volta o total ao de antes do Ajuste (8, o SET absoluto de sempre). Sem devolver, P ficaria com 8 - 2 = 6; ela tem 3,
      // entao devolve 3 — a A primeiro (a ordem da drenagem).
      assert.strictEqual(await fis(m), 8);
      assert.strictEqual(await linhas(m), 'A256T/-=3 B256T/-=2 P256T/-=3');
    });

  await test('[RN-256.03] Entrada noutra prateleira no meio: o residuo nao passa do que a padrao tem -> nada devolvido (como antes)',
    async () => {
      const m = await material();
      await entrar(m, 5, { localizacao_destino_id: A.id });
      await entrar(m, 3, { localizacao_destino_id: B.id });
      const aj = await ajustar(m, 2);
      await entrar(m, 6, { localizacao_destino_id: B.id }); // B 8, total 8
      const est = await cancelar(aj);
      assert.strictEqual(est.status, 200, JSON.stringify(est.body));
      // Total volta a 8; sem devolver, P = 8 - 8 = 0 — o que ela ja tem: nada a devolver.
      assert.strictEqual(await linhas(m), 'A256T/-=0 B256T/-=8 P256T/-=0');
    });

  await test('[RN-256.03, Fase 2 achado 3] padrao NEGATIVA (legado): o limite conta a padrao como 0 — devolve 3 e P fica 0 (nao -2)',
    async () => {
      const m = await material();
      await entrar(m, 5, { localizacao_destino_id: A.id });
      await entrar(m, 3, { localizacao_destino_id: B.id });
      const aj = await ajustar(m, 2); // A 0, B 2, P 0 (drenou A 5 e B 1)
      await entrar(m, 3, { localizacao_destino_id: B.id }); // B 5
      // Dado antigo: a padrao negativa (total = soma das linhas).
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = -2 WHERE material_id = ? AND localizacao_id = ?', [m, P.id]);
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 3 WHERE id = ?', [m]);
      const est = await cancelar(aj);
      assert.strictEqual(est.status, 200, JSON.stringify(est.body));
      // Total 8; sem devolver, P = 8 - 5 = 3. Contando a padrao como -2 o limite seria 5 (A 5, P -2); contando como 0, 3 (A 3, P 0).
      assert.strictEqual(await linhas(m), 'A256T/-=3 B256T/-=5 P256T/-=0');
    });

  // ── RN-256.04: o que nao tem registro ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-256.04] Ajuste antigo (sem registro): o estorno faz o de antes — tudo na padrao', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4);
    await entrar(m, 3, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    const aj = await ajustar(m, 4);
    await dbRun(db, 'DELETE FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id = ?', [aj]);
    const est = await cancelar(aj);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await linhas(m), 'A256T/-=7 B256T/-=0');
  });

  await test('[RN-256.04] a prateleira drenada virou a posicao padrao: pulada, o residuo cai nela (A 4, B 3)', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4);
    await entrar(m, 3, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    const aj = await ajustar(m, 4);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = ? WHERE id = ?', [B.id, m]);
    const est = await cancelar(aj);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=3');
  });

  await test('[RN-256.04] a linha drenada que nao existe mais (apagada direto no banco; nenhum gesto do sistema apaga) e pulada', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4);
    await entrar(m, 3, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    const aj = await ajustar(m, 4);
    await dbRun(db, 'DELETE FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, B.id]); // B estava em 0
    const est = await cancelar(aj);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    // Sem a linha, as 3 ficam no residuo da padrao (como antes): o total e a soma das linhas batem.
    assert.strictEqual(await linhas(m), 'A256T/-=7');
    assert.strictEqual(await fis(m), 7);
  });

  await test('[RN-256.01, E] a gravacao do registro falhando nao derruba o Ajuste; o estorno dele faz o de antes', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4);
    await entrar(m, 3, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    await dbRun(db, `CREATE TRIGGER t256_reg BEFORE INSERT ON ajuste_linhas_drenadas_almoxarifado
      BEGIN SELECT RAISE(ABORT, 'falha forcada 256 registro'); END`);
    let r;
    const warn = console.warn; console.warn = () => {};
    try { r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4 }); } finally {
      console.warn = warn; await dbRun(db, 'DROP TRIGGER IF EXISTS t256_reg');
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=0');
    const est = await cancelar(r.body.id);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await linhas(m), 'A256T/-=7 B256T/-=0');
  });

  await test('[RN-256.01, E] o registro falhando no meio (2a linha) nao fica pela metade (um INSERT so): o estorno faz o de antes',
    async () => {
      const m = await material();
      await entrar(m, 30, { localizacao_destino_id: A.id });
      await entrar(m, 20, { localizacao_destino_id: B.id });
      await dbRun(db, `CREATE TRIGGER t256_meio BEFORE INSERT ON ajuste_linhas_drenadas_almoxarifado
        WHEN EXISTS (SELECT 1 FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id = NEW.movimentacao_id)
        BEGIN SELECT RAISE(ABORT, 'falha forcada 256 meio'); END`);
      let r;
      const warn = console.warn; console.warn = () => {};
      try { r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 5 }); } finally {
        console.warn = warn; await dbRun(db, 'DROP TRIGGER IF EXISTS t256_meio');
      }
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.strictEqual(await registro(r.body.id), '', 'ficou registro pela metade');
      const est = await cancelar(r.body.id);
      assert.strictEqual(est.status, 200, JSON.stringify(est.body));
      assert.strictEqual(await linhas(m), 'A256T/-=0 B256T/-=5 P256T/-=45');
    });

  // ── RN-256.05: o desfazer ────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-256.05] o livro do estorno falhando: as prateleiras devolvidas voltam, o estado e o de antes; de novo, sem a falha, certo',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 4);
      await entrar(m, 3, { localizacao_destino_id: B.id });
      await separar(m, 4, A.id);
      const aj = await ajustar(m, 4);
      assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=0', 'premissa');
      await dbRun(db, `CREATE TRIGGER t256_falha BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'ESTORNO'
        BEGIN SELECT RAISE(ABORT, 'falha forcada 256'); END`);
      let r;
      try { r = await cancelar(aj); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS t256_falha'); }
      assert.ok(r.status >= 400, `o estorno passou com o livro falhando: ${r.status}`);
      assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=0', 'o desfazer nao tirou a devolucao de B');
      assert.strictEqual(await fis(m), 4);
      const de = await cancelar(aj);
      assert.strictEqual(de.status, 200, `de novo: ${JSON.stringify(de.body)}`);
      assert.strictEqual(await linhas(m), 'A256T/-=4 B256T/-=3');
    });

  await test('[RN-256.05] com lote: o livro do estorno falhando devolve o estado de antes', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 4, { lote: 'LB' });
    await entrar(m, 3, { lote: 'LB', localizacao_destino_id: B.id });
    const LB = await loteId(m, 'LB');
    await separar(m, 4, A.id, LB);
    const aj = await ajustar(m, 4, { lote_id: LB });
    await dbRun(db, `CREATE TRIGGER t256_falha2 BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'ESTORNO'
      BEGIN SELECT RAISE(ABORT, 'falha forcada 256'); END`);
    let r;
    try { r = await cancelar(aj); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS t256_falha2'); }
    assert.ok(r.status >= 400, `o estorno passou com o livro falhando: ${r.status}`);
    assert.strictEqual(await linhas(m), 'A256T/LB=4 B256T/LB=0', 'o desfazer nao tirou a devolucao de B');
  });

  // ── RN-256.06: o que nao muda ────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-256.06] o Ajuste COM localizacao nao grava e o estorno dele e o de sempre', async () => {
    const m = await material();
    await entrar(m, 5, { localizacao_destino_id: A.id });
    await entrar(m, 3, { localizacao_destino_id: B.id });
    const aj = await ajustar(m, 2, { localizacao_destino_id: A.id });
    assert.strictEqual(await linhas(m), 'A256T/-=2 B256T/-=3', 'premissa');
    assert.strictEqual(await registro(aj), '');
    const est = await cancelar(aj);
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    assert.strictEqual(await linhas(m), 'A256T/-=5 B256T/-=3');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
