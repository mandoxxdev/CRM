/**
 * Etapa 257 (C544) — o estorno da Saida devolve as pecas as prateleiras de onde a baixa saiu.
 *
 * A Saida sem origem (e a entrega de requisicao, e o consumo) baixa de varias prateleiras (`claimSaldoSemLote`, `claimSaldoDoLote`). O
 * estorno nao sabia de onde: punha tudo na chave (origem do livro ou posicao padrao, lote) — padrao A 3, B 5, Saida de 6 -> A 0, B 2;
 * estorno -> A 6, B 2. Agora a ida grava as linhas baixadas (a tabela da Etapa 256) e o estorno devolve a cada uma o que saiu dela
 * (RN-257.01..06).
 *
 * Cuidado com teste vazio: o 200 do estorno de antes e o de depois sao iguais — todo cenario confere as LINHAS.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa257-estorno-saida-devolve-prateleira.md
 * Executar: cd server && node tests/api/estornoSaidaDevolvePrateleira.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 257', role: 'admin', is_superadmin: 1, email: 'a257@t.com' },
  ALMOX: { id: 25701, nome: 'Almox 257', role: 'user', email: 'x257@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 257: o estorno da Saida devolve as prateleiras de onde a baixa saiu (C544) ===\n');
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
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM257T', nome: 'A257T' });
  const loc = async (codigo) => {
    await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A257T'); const B = await loc('B257T'); const P = await loc('P257T');
  let seq = 0;
  const material = async ({ padrao = P.id, negativo = 0, serie = 0 } = {}) => {
    const c = `ESA257-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,?,?,?,1)`,
    [c, c, serie, negativo, padrao])).lastID;
  };
  const v2 = (b) => como('ADMIN').post(`${API}/movimentacoes/v2`, { motivo: 'teste 257', justificativa: 'teste 257', ...b });
  const cancelar = (id) => como('ADMIN').post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'teste 257' });
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const soma = async (m) => Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id=?',
    [m])).q);
  const registro = async (movId) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, d.quantidade q
    FROM ajuste_linhas_drenadas_almoxarifado d JOIN estoque_saldo_almoxarifado s ON s.id = d.saldo_id
    LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id
    WHERE d.movimentacao_id = ? ORDER BY d.id`, [movId])).map((r) => `${r.loc}/${r.lote}=${r.q}`).join(' ');
  const entrar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `entrada de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const sair = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'SAIDA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `saida de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, codigo])).id;
  const sid = async (m, numero) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id=? AND numero=?', [m, numero])).id;
  const estornar = async (id) => {
    const r = await cancelar(id);
    assert.strictEqual(r.status, 200, `estorno: ${JSON.stringify(r.body)}`);
  };

  // ── RN-257.01: a ida grava o que baixou ─────────────────────────────────────────────────────────────────────────────────
  await test('[RN-257.01] a Saida que baixou de duas prateleiras grava cada uma e quanto, na ordem; as linhas da ida sao as de sempre',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const s = await sair(m, 6);
      assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2', 'a ida mudou (Etapa 51)');
      assert.strictEqual(await registro(s), 'A257T/-=3 B257T/-=3');
    });

  // ── RN-257.02: o estorno devolve as prateleiras ─────────────────────────────────────────────────────────────────────────
  await test('[RN-257.02] C544: padrao A 3, B 5, Saida de 6, estorno -> A 3, B 5 (antes: A 6, B 2)', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s = await sair(m, 6);
    await estornar(s);
    assert.strictEqual(await fis(m), 8);
    assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=5', 'o estorno nao devolveu a B');
  });

  await test('[RN-257.02] padrao P vazia, A 4, B 4, Saida de 6 -> estorno A 4, B 4, P 0 (antes: P 6)', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 4, { localizacao_destino_id: B.id });
    const s = await sair(m, 6);
    assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2', 'premissa');
    await estornar(s);
    assert.strictEqual((await linhas(m)).replace(/ ?P257T\/-=0/, ''), 'A257T/-=4 B257T/-=4');
    assert.strictEqual(await fis(m), 8);
  });

  await test('[RN-257.02] com lote: L em A 3 e em B 3, Saida de 5 do lote sem origem -> estorno devolve o lote a A e a B', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3, { lote: 'L1' });
    await entrar(m, 3, { lote: 'L1', localizacao_destino_id: B.id });
    const L = await loteId(m, 'L1');
    const s = await sair(m, 5, { lote_id: L });
    assert.strictEqual(await linhas(m), 'A257T/L1=0 B257T/L1=1', 'premissa');
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/L1=3 B257T/L1=3');
  });

  await test('[RN-257.02] a linha do resto (material que permite negativo): A 2, B 1, Saida de 5 -> A -2, B 0; estorno -> A 2, B 1', async () => {
    const m = await material({ padrao: A.id, negativo: 1 });
    await entrar(m, 2);
    await entrar(m, 1, { localizacao_destino_id: B.id });
    const s = await sair(m, 5);
    assert.strictEqual(await linhas(m), 'A257T/-=-2 B257T/-=0', 'premissa');
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/-=2 B257T/-=1');
    assert.strictEqual(await fis(m), 3);
  });

  await test('[RN-257.02] com serie: as series voltam ao estoque e as linhas a A e B', async () => {
    const m = await material({ padrao: A.id, serie: 1 });
    await entrar(m, 1, { series: ['S1'] });
    await entrar(m, 2, { series: ['S2', 'S3'], localizacao_destino_id: B.id });
    const s = await sair(m, 2, { serie_ids: [await sid(m, 'S1'), await sid(m, 'S2')] });
    assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=1', 'premissa');
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/-=1 B257T/-=2');
    const em = await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id=? AND status='EM_ESTOQUE'", [m]);
    assert.strictEqual(Number(em.n), 3);
  });

  await test('[RN-257.02, integracao rota] v2 Saida -> estorno -> a transferencia de 5 a partir de B (que o C544 recusava) sai', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s = await sair(m, 6);
    await estornar(s);
    const tr = await v2({ material_id: m, tipo: 'TRANSFERENCIA', quantidade: 5, localizacao_origem_id: B.id, localizacao_destino_id: P.id });
    assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
    assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=0 P257T/-=5');
  });

  await test('[RN-257.06] a entrega de requisicao grava o registro, mas o estorno pelo livro continua recusado (a exclusao e outro caminho)',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
        VALUES (?,1,'S','APROVADO')`, [`R257T-${++seq}`])).lastID;
      const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,6,0,0,0)`, [R, m])).lastID;
      const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 6 }] });
      assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
      const ent = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 6 }] });
      assert.strictEqual(ent.status, 200, `entrega de premissa: ${JSON.stringify(ent.body)}`);
      assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2', 'premissa');
      const saida = await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND requisicao_id = ? AND tipo = 'SAIDA'
        ORDER BY id DESC LIMIT 1`, [m, R]);
      assert.strictEqual(await registro(saida.id), 'A257T/-=3 B257T/-=3');
      const r = await cancelar(saida.id);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, 'Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)');
      assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2');
    });

  await test('[RN-257.02, servico] pelo servico (registrarMovimentacao + cancelarMovimentacao) o mesmo resultado; total = soma das linhas',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const s = await stockService.registrarMovimentacao(db, USERS.ADMIN, { material_id: m, tipo: 'SAIDA', quantidade: 6,
        motivo: 's', justificativa: 's' });
      await stockService.cancelarMovimentacao(db, USERS.ADMIN, s.id, 'servico');
      assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=5');
      assert.strictEqual(await fis(m), await soma(m));
    });

  await test('[RN-257.02, Fase 5] duas Saidas no mesmo material: cada estorno devolve o SEU registro', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s1 = await sair(m, 2); // A 1, B 5
    const s2 = await sair(m, 4); // A 0, B 2 (1 de A, 3 de B)
    assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2', 'premissa');
    await estornar(s1);
    assert.strictEqual(await linhas(m), 'A257T/-=2 B257T/-=2', 'o 1o estorno leu o registro do outro');
    await estornar(s2);
    assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=5');
  });

  // ── RN-257.03: o que cai no caminho de antes ────────────────────────────────────────────────────────────────────────────
  await test('[RN-257.03] Saida antiga (sem registro): o estorno faz o de antes — tudo na chave (padrao)', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s = await sair(m, 6);
    await dbRun(db, 'DELETE FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id = ?', [s]);
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/-=6 B257T/-=2');
  });

  await test('[RN-257.03] a linha registrada que nao existe mais (apagada direto no banco): a parte dela vai para a padrao', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s = await sair(m, 6);
    const lb = await dbGet(db, 'SELECT id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, B.id]);
    // tira a linha de B (2) e o total junto, para o estado continuar coerente: so o registro aponta para o que sumiu
    await dbRun(db, 'DELETE FROM estoque_saldo_almoxarifado WHERE id = ?', [lb.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual - ? WHERE id = ?', [lb.quantidade, m]);
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/-=6');
    assert.strictEqual(await fis(m), 6);
  });

  await test('[RN-257.03] registro que soma MAIS que a saida (so adulterado no banco): a devolucao para na quantidade da saida', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s = await sair(m, 6);
    const lb = await dbGet(db, 'SELECT id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, B.id]);
    await dbRun(db, 'INSERT INTO ajuste_linhas_drenadas_almoxarifado (movimentacao_id, saldo_id, quantidade) VALUES (?,?,4)', [s, lb.id]);
    await estornar(s);
    assert.strictEqual(await fis(m), 8);
    assert.strictEqual(await soma(m), 8, 'a soma das linhas passou do total');
    assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=5');
  });

  await test('[RN-257.01, E] a gravacao do registro falhando nao derruba a Saida; o estorno dela faz o de antes', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    await dbRun(db, `CREATE TRIGGER t257_reg BEFORE INSERT ON ajuste_linhas_drenadas_almoxarifado
      WHEN EXISTS (SELECT 1 FROM ajuste_linhas_drenadas_almoxarifado WHERE movimentacao_id = NEW.movimentacao_id)
      BEGIN SELECT RAISE(ABORT, 'falha forcada 257 registro'); END`);
    let r;
    const warn = console.warn; console.warn = () => {};
    try { r = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 6 }); } finally {
      console.warn = warn; await dbRun(db, 'DROP TRIGGER IF EXISTS t257_reg');
    }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2');
    assert.strictEqual(await registro(r.body.id), '', 'ficou registro pela metade');
    await estornar(r.body.id);
    assert.strictEqual(await linhas(m), 'A257T/-=6 B257T/-=2');
  });

  // ── RN-257.04: a prateleira bloqueada recebe de volta ───────────────────────────────────────────────────────────────────
  await test('[RN-257.04] a prateleira bloqueada depois da Saida recebe de volta o que saiu dela', async () => {
    const X = await loc(`X257T-${++seq}`);
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: X.id });
    const s = await sair(m, 6);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [X.id]);
    await estornar(s);
    assert.strictEqual(await linhas(m), `A257T/-=3 ${X.codigo}/-=5`);
  });

  // ── RN-257.05: o desfazer ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-257.05] o livro do estorno falhando: as prateleiras devolvidas voltam, o estado e o de antes; de novo, sem a falha, certo',
    async () => {
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const s = await sair(m, 6);
      await dbRun(db, `CREATE TRIGGER t257_falha BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'ESTORNO'
        BEGIN SELECT RAISE(ABORT, 'falha forcada 257'); END`);
      let r;
      try { r = await cancelar(s); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS t257_falha'); }
      assert.ok(r.status >= 400, `o estorno passou com o livro falhando: ${r.status}`);
      assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2', 'o desfazer nao tirou a devolucao');
      assert.strictEqual(await fis(m), 2);
      const c = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [s]);
      assert.strictEqual(Number(c.cancelado), 0);
      await estornar(s);
      assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=5');
    });

  await test('[RN-257.05] com serie: a reversao das series falhando desfaz as devolucoes das linhas', async () => {
    const m = await material({ padrao: A.id, serie: 1 });
    await entrar(m, 1, { series: ['T1'] });
    await entrar(m, 2, { series: ['T2', 'T3'], localizacao_destino_id: B.id });
    const s = await sair(m, 2, { serie_ids: [await sid(m, 'T1'), await sid(m, 'T2')] });
    await dbRun(db, `CREATE TRIGGER t257_serie BEFORE UPDATE OF status ON series_almoxarifado WHEN NEW.status = 'EM_ESTOQUE'
      AND OLD.movimentacao_saida_id = ${Number(s)} BEGIN SELECT RAISE(ABORT, 'falha forcada 257 serie'); END`);
    let r;
    try { r = await cancelar(s); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS t257_serie'); }
    assert.ok(r.status >= 400, `o estorno passou com a serie falhando: ${r.status}`);
    assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=1', 'o desfazer nao tirou a devolucao');
    assert.strictEqual(await fis(m), 1);
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/-=1 B257T/-=2');
  });

  // ── RN-257.06: o que nao muda ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-257.06] a Saida de uma prateleira so (com origem) grava uma linha e o estorno e o de sempre', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const s = await sair(m, 4, { localizacao_origem_id: B.id });
    assert.strictEqual(await registro(s), 'B257T/-=4');
    await estornar(s);
    assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=5');
  });

  await test('[RN-257.06] o estorno do AJUSTE nao le o registro de uma Saida (cada movimento le o seu)', async () => {
    const m = await material({ padrao: A.id });
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    await sair(m, 6); // A 0, B 2 (registro da saida)
    const aj = (await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4 })).body.id; // padrao A recebe 2: A 2, B 2
    assert.strictEqual(await linhas(m), 'A257T/-=2 B257T/-=2', 'premissa');
    await estornar(aj);
    assert.strictEqual(await linhas(m), 'A257T/-=0 B257T/-=2');
  });

  await test('[C550, documenta] Saida, Ajuste para menos, estorno da Saida e depois o do Ajuste: o SET absoluto deixa a padrao negativa',
    async () => {
      // Achado da Fase 2: o estorno do AJUSTE sem localizacao volta o total ao saldo_anterior (valor fixo, D (256) 3) e grava o residuo na
      // padrao. Estornado DEPOIS do estorno de uma Saida mais antiga, o total fica errado (2, o certo seria 8) — como antes da 257 — e,
      // como as pecas da Saida agora voltam a B e nao a padrao, o residuo deixa A negativa num material sem negativo (antes: A 1, B 1).
      // Este cenario afirma o defeito para o conserto (a proxima tarefa do plano) o virar.
      const m = await material({ padrao: A.id });
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const s = await sair(m, 6); // A 0, B 2
      const aj = (await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 1 })).body.id; // A 0, B 1
      await estornar(s); // A 3, B 4
      assert.strictEqual(await linhas(m), 'A257T/-=3 B257T/-=4', 'premissa');
      await estornar(aj);
      assert.strictEqual(await fis(m), 2);
      assert.strictEqual(await linhas(m), 'A257T/-=-2 B257T/-=4');
    });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
