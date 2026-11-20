/**
 * Etapa 254 (C548) — o Ajuste sem lote, para baixo, nao tira da prateleira onde esta a caixa separada de uma requisicao.
 *
 * O AJUSTE sem localizacao define o TOTAL do material; quando baixa, o `drenar` da Etapa 51 tira das prateleiras sem lote (a maior
 * primeiro) antes de negativar a linha padrao. A maior podia ser a da caixa separada: A 4 (separadas de A) e B 3, ajuste para 4 -> A 1,
 * B 3, e a entrega recusada com "a origem da separacao (A) nao serve mais". A Etapa 253 (Fase 5) deu ao ramo COM lote duas passadas
 * (primeiro a parte nao guardada pela caixa viva); esta etapa estende ao ramo sem lote (RN-254.01..03).
 *
 * Cuidado com teste vazio: o 201 de antes e o de depois sao iguais — todo cenario confere as LINHAS (e a entrega, quando cabe).
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa254-ajuste-poupa-caixa-e-cadastro-a-completar.md
 * Executar: cd server && node tests/api/ajusteSemLotePoupaCaixa.api.test.js
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
  ADMIN: { id: 1, nome: 'Adm 254', role: 'admin', is_superadmin: 1, email: 'a254@t.com' },
  ALMOX: { id: 25401, nome: 'Almox 254', role: 'user', email: 'x254@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 254: o Ajuste sem lote poupa a caixa separada (C548) ===\n');
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
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM254T', nome: 'A254T' });
  const loc = async (codigo) => {
    await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A254T'); const B = await loc('B254T'); const P = await loc('P254T');
  let seq = 0;
  const material = async ({ padrao = P.id } = {}) => {
    const c = `AJS254-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,0,0,?,1)`,
    [c, c, padrao])).lastID;
  };
  const v2 = (b) => como('ADMIN').post(`${API}/movimentacoes/v2`, { motivo: 'teste 254', justificativa: 'teste 254', ...b });
  // As linhas como texto ordenado ("A254T/-=4 B254T/-=0"), o estado inteiro numa comparacao.
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const entrar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `entrada de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const separar = async (m, q, origem, lote = undefined) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S','APROVADO')`, [`R254T-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item,
      quantidade_separada: q, localizacao_origem_id: origem, ...(lote ? { lote_id: lote } : {}) }] });
    assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
    return { R, item };
  };
  const entregar = (R, item, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`,
    { itens_atendidos: [{ item_id: item, quantidade_atendida: q }] });

  // ── RN-254.01: a caixa e a ultima a ser drenada ───────────────────────────────────────────────────────────────────────────
  await test('[RN-254.01] C548: A 4 separadas de A e B 3, ajuste para 4 -> A 4, B 0; a entrega sai', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 3, { localizacao_destino_id: B.id });
    const { R, item } = await separar(m, 4, A.id);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await fis(m), 4);
    assert.strictEqual(await linhas(m), 'A254T/-=4 B254T/-=0 P254T/-=0', 'o drenar levou a caixa de A');
    const ent = await entregar(R, item, 4);
    assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
    assert.strictEqual(await linhas(m), 'A254T/-=0 B254T/-=0 P254T/-=0');
  });

  await test('[RN-254.01] a parte NAO separada da prateleira da caixa sai antes da outra prateleira (A 5 com 2 separadas, B 3, ajuste para 4)',
    async () => {
      const m = await material();
      await entrar(m, 5, { localizacao_destino_id: A.id });
      await entrar(m, 3, { localizacao_destino_id: B.id });
      const { R, item } = await separar(m, 2, A.id);
      const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 4 });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      // 1a passada: A pode dar 3 (5 - 2 separadas), B 3 -> tira 3 de A e 1 de B. Na passada unica: A 1, B 3 (as 2 separadas ficavam sem peca).
      assert.strictEqual(await linhas(m), 'A254T/-=2 B254T/-=2 P254T/-=0', 'o drenar tirou da parte separada');
      const ent = await entregar(R, item, 2);
      assert.strictEqual(ent.status, 200, `a entrega foi recusada: ${JSON.stringify(ent.body)}`);
    });

  await test('[RN-254.01] o mesmo pela conclusao da contagem (AJUSTE_INVENTARIO sem lote, pelo servico)', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 3, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m, tipo: 'AJUSTE_INVENTARIO', quantidade: 4, motivo: 'conferencia', justificativa: 'conferencia' });
    assert.strictEqual(await linhas(m), 'A254T/-=4 B254T/-=0 P254T/-=0', 'a contagem levou a caixa de A');
  });

  // ── RN-254.02: sem outra saida, a caixa e drenada ─────────────────────────────────────────────────────────────────────────
  await test('[RN-254.02] a guarda de retencao continua decidindo SE passa: abaixo da caixa, 400 e nada muda', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 1, { localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 2 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Ajuste para 2 UN deixaria o disponível negativo (separada na caixa de requisição: 4, mínimo '
      + 'aceitável: 4 UN). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.');
    assert.strictEqual(await linhas(m), 'A254T/-=4 B254T/-=1');
  });

  await test('[RN-254.02] sem outra linha SEM lote para tirar, a caixa e drenada (o resto esta num lote): o total manda', async () => {
    const m = await material();
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 1, { localizacao_destino_id: B.id });
    await entrar(m, 3, { lote: 'LY', localizacao_destino_id: B.id });
    await separar(m, 4, A.id);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 5 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    // 8 -> 5: a 1a passada tira o 1 de B (A esta toda separada); a 2a tira 2 de A — o Ajuste sem lote so drena linhas sem lote.
    assert.strictEqual(await linhas(m), 'A254T/-=2 B254T/-=0 B254T/LY=3 P254T/-=0');
    assert.strictEqual(await fis(m), 5);
  });

  // ── RN-254.03: o que nao muda ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-254.03] sem caixa: a ordem de sempre (Etapa 51) — A 30, B 20, ajuste para 5 -> A 0, B 5', async () => {
    const m = await material();
    await entrar(m, 30, { localizacao_destino_id: A.id });
    await entrar(m, 20, { localizacao_destino_id: B.id });
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 5 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A254T/-=0 B254T/-=5 P254T/-=0');
  });

  await test('[RN-254.03] o separado COM lote em A nao protege as linhas SEM lote de A (o par e endereco + lote)', async () => {
    const m = await material();
    await entrar(m, 4, { lote: 'LX', localizacao_destino_id: A.id });
    await entrar(m, 4, { localizacao_destino_id: A.id });
    await entrar(m, 3, { localizacao_destino_id: B.id });
    const LX = (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, 'LX'])).id;
    await separar(m, 4, A.id, LX);
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 8 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    // 11 -> 8: as linhas sem lote drenam 3; A sem lote (4) e a maior e nao esta separada (a caixa e do lote LX).
    assert.strictEqual(await linhas(m), 'A254T/-=1 A254T/LX=4 B254T/-=3 P254T/-=0', 'o drenar leu a caixa do lote como se fosse sem lote');
  });

  await test('[RN-254.03] a caixa de uma requisicao ja entregue (caixa vazia) nao protege nada', async () => {
    const m = await material();
    await entrar(m, 6, { localizacao_destino_id: A.id });
    await entrar(m, 3, { localizacao_destino_id: B.id });
    const { R, item } = await separar(m, 2, A.id);
    const ent = await entregar(R, item, 2);
    assert.strictEqual(ent.status, 200, `premissa: ${JSON.stringify(ent.body)}`);
    assert.strictEqual(await linhas(m), 'A254T/-=4 B254T/-=3', 'premissa');
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 3 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await linhas(m), 'A254T/-=0 B254T/-=3 P254T/-=0');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
