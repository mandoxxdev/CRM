/**
 * Etapa 96 — o motor grava a quantidade arredondada e nao recusa o que existe por ponto flutuante (C176, features 03
 * com a 05 e a 07).
 *
 * As colunas de quantidade sao REAL. 0,7 + 0,2 + 0,1 gravava 0.9999999999999999 e o pedido de 1 era recusado; e o
 * disponivel, sendo uma DIFERENCA de colunas (fisico - retencoes), saia torto mesmo com as colunas limpas
 * (0,3 - 0,1 = 0.19999999999999998). A regra unica (server/services/almoxarifado/quantidade.js, namespace `Q`):
 * arredondar a 1e-6 ao gravar (`Q.qtd`, `Q.qtdSql`) e comparar com folga de 1e-9 ao recusar (`Q.cabe`, `Q.FOLGA_SQL`).
 *
 * Usuarios reais por header (molde 92-95): S sem perfil (PRODUCAO) cria a requisicao pela rota; ADMIN superadmin aprova
 * e movimenta por /movimentacoes/v2. O LEGADO torto e montado por ESCRITOR DIRETO (`UPDATE ... = 0.9999999999999999`),
 * nunca pelo motor — depois da T1 o motor nao produz mais deriva, e um teste que a fabricasse pelo motor ficaria vazio.
 *
 * T0: RN-00 (o helper) e a parte da RN-02 que o disponivel arredondado resolve (colunas limpas; o legado na SAIDA sem
 * origem, na reserva manual e na aprovacao — Fase 2, I2).
 * T1: o motor (stockService.js) — RN-01 (grava arredondado; varredura do codigo-fonte), RN-02 nas portas de coluna
 * crua (origem, lote, transferencia, desbloqueio), o estorno (Fase 2, K1 e I1), RN-03 (a folga nao inventa estoque),
 * RN-04 (a porta arredonda) e RN-05 (a mensagem diz o numero arredondado). Casos `[96 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md
 *
 * Executar: cd server && node tests/api/quantidadeArredondada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const Q = require('../../services/almoxarifado/quantidade');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 96', role: 'admin', is_superadmin: 1, email: 'a96@t.com' },
  S: { id: 9601, nome: 'Solic 96', role: 'user', email: 's96@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9602, nome: 'Almox 96', role: 'user', email: 'x96@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const TORTO = 0.9999999999999999; // 0,7 + 0,2 + 0,1 somados em ponto flutuante
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 96: o motor grava a quantidade arredondada e nao recusa o que existe ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
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

  const material = async (fisico = 0) => {
    const c = `E96-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0, 0.1)`, [c, c, fisico])).lastID;
  };
  // Legado: a coluna do material escrita direto, como o motor antigo a deixava.
  const legado = async (valor = TORTO) => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [valor, m]);
    const lido = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.strictEqual(lido.q, valor, 'premissa: o legado ficou torto');
    return m;
  };
  const mov = (m, tipo, quantidade, extra = {}) => como('ADMIN').post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo, quantidade, motivo: 'e96', justificativa: 'teste da etapa 96', ...extra,
  });
  const entrar = async (m, q) => { const r = await mov(m, 'ENTRADA', q); assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`); };
  const reservar = (m, q) => como('ADMIN').post(`${API}/reservas`, { material_id: m, quantidade: q, os_referencia: 'OS-96' });
  const bloquear = (m, q) => como('ADMIN').post(`${API}/materiais/${m}/bloquear`, { quantidade: q, motivo: 'e96', justificativa: 'teste da etapa 96' });
  const mat = (m) => dbGet(db, 'SELECT quantidade_atual, quantidade_reservada, quantidade_bloqueada FROM materiais_almoxarifado WHERE id=?', [m]);
  const sqlRound = async (v) => (await dbGet(db, 'SELECT ROUND(?, 6) r', [v])).r;

  // ─────────────────────────── T0: o helper ───────────────────────────
  await test('[96 RN-00] Q.qtd arredonda a 1e-6 e concorda com o ROUND do SQLite (inclusive no meio 0,0000005)', async () => {
    assert.strictEqual(Q.qtd(0.1 + 0.2), 0.3);
    assert.strictEqual(Q.qtd(TORTO), 1);
    assert.strictEqual(Q.qtd(-0.30000000000000004), -0.3);
    assert.strictEqual(Q.qtd(0.0000004), 0);
    assert.strictEqual(Q.qtd(1.0000004), 1);
    // Fase 2, I6: o binario de 5e-7 fica ABAIXO do meio — o SQLite da 0, e o helper tem de dar o mesmo.
    assert.strictEqual(Q.qtd(0.0000005), 0);
    assert.strictEqual(Q.qtd(1.0000005), 1.000001);
    for (const v of [0.1 + 0.2, TORTO, -0.30000000000000004, 0.0000004, 0.0000005, 1.0000005, 0.0000015, 123456.1234565]) {
      assert.strictEqual(Q.qtd(v), (await sqlRound(v)) + 0, `qtd(${v}) x ROUND do SQLite`);
    }
  });
  await test('[96 RN-00] Q.qtd nunca devolve -0', async () => {
    assert.ok(Object.is(Q.qtd(-0.0000004), 0), `veio ${Object.is(Q.qtd(-0.0000004), -0) ? '-0' : Q.qtd(-0.0000004)}`);
    assert.ok(Object.is(Q.qtd(-0), 0));
  });
  await test('[96 RN-00] Q.qtd nao inventa numero: null, \'\', booleano, texto e nao-finito -> NaN; texto numerico vale', async () => {
    for (const v of [null, undefined, '', '  ', true, false, 'abc', NaN, Infinity, -Infinity, {}, []]) {
      assert.ok(Number.isNaN(Q.qtd(v)), `Q.qtd(${JSON.stringify(v)}) devia ser NaN, veio ${Q.qtd(v)}`);
    }
    assert.strictEqual(Q.qtd('0.7'), 0.7);
    assert.strictEqual(Q.qtd(' 2 '), 2);
  });
  await test('[96 RN-00] Q.cabe tem folga de ponto flutuante e nao aceita o que nao existe', async () => {
    assert.ok(Q.cabe(1, TORTO));
    assert.ok(Q.cabe(0.2, 0.3 - 0.1));
    assert.ok(Q.cabe('1', '1'));
    assert.ok(!Q.cabe(0.200001, 0.2));
    assert.ok(!Q.cabe(1.000001, 1));
    assert.ok(Q.QTD_FOLGA < 5e-7, 'a folga tem de ser menor que meia unidade da precisao');
  });
  await test('[96 RN-00] Q.qtdSql e Q.FOLGA_SQL sao SQL valido e fazem a conta', async () => {
    assert.strictEqual(Q.qtdSql('a + ?'), 'ROUND((a + ?), 6)');
    const r = await dbGet(db, `SELECT ${Q.qtdSql('? + ? + ?')} s, (? >= ? ${Q.FOLGA_SQL}) cabe, (? >= ? ${Q.FOLGA_SQL}) naoCabe`,
      [0.7, 0.2, 0.1, TORTO, 1, 0.2, 0.200001]);
    assert.deepStrictEqual({ ...r }, { s: 1, cabe: 1, naoCabe: 0 });
  });

  // ─────────────────── T0: o disponivel arredondado (B486) ───────────────────
  await test('[96 RN-02] colunas limpas: fisico 0,3 e reservado 0,1 -> SAIDA 0,2 -> 201 (o disponivel e uma diferenca)', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    const rv = await reservar(m, 0.1);
    assert.strictEqual(rv.status, 201, `reserva 0,1: ${JSON.stringify(rv.body)}`);
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0.3, quantidade_reservada: 0.1, quantidade_bloqueada: 0 },
      'premissa: as duas colunas estao limpas');
    const s = await mov(m, 'SAIDA', 0.2);
    assert.strictEqual(s.status, 201, `SAIDA 0,2: ${JSON.stringify(s.body)}`);
  });
  await test('[96 RN-02] colunas limpas: fisico 0,3 e bloqueado 0,1 -> reserva 0,2 -> 201', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    const b = await bloquear(m, 0.1);
    assert.strictEqual(b.status, 200, `bloquear 0,1: ${JSON.stringify(b.body)}`);
    assert.strictEqual((await mat(m)).quantidade_bloqueada, 0.1, 'premissa: bloqueado limpo');
    const rv = await reservar(m, 0.2);
    assert.strictEqual(rv.status, 201, `reserva 0,2: ${JSON.stringify(rv.body)}`);
  });
  await test('[96 RN-02] o extrato do material le o disponivel arredondado (fisico 0,3 e reservado 0,1 -> 0,2)', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    assert.strictEqual((await reservar(m, 0.1)).status, 201);
    const ex = await como('ADMIN').get(`${API}/materiais/${m}/extrato`);
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
    assert.strictEqual(ex.body.material.quantidade_disponivel, 0.2);
  });
  await test('[96 RN-02] legado torto (escrito direto): SAIDA 1 sem origem -> 201 (a pre-checagem e o claim leem o disponivel arredondado)', async () => {
    const m = await legado();
    const s = await mov(m, 'SAIDA', 1);
    assert.strictEqual(s.status, 201, `SAIDA 1: ${JSON.stringify(s.body)}`);
  });
  await test('[96 RN-02] legado torto: POST /reservas 1 -> 201', async () => {
    const m = await legado();
    const rv = await reservar(m, 1);
    assert.strictEqual(rv.status, 201, `reserva 1: ${JSON.stringify(rv.body)}`);
  });
  await test('[96 RN-02] legado torto: aprovar a requisicao de 1 reserva 1 (TOTALMENTE_RESERVADA — fecha a ressalva do 6e0fae83)', async () => {
    const m = await legado();
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-96', itens: [{ material_id: m, quantidade: 1 }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const rs = await dbAll(db, `SELECT quantidade, status FROM reservas_material_almoxarifado WHERE requisicao_id = ?`, [cr.body.id]);
    assert.deepStrictEqual(rs.map((r) => [r.quantidade, r.status]), [[1, 'ATIVA']]);
    const st = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [cr.body.id]);
    assert.strictEqual(st.status, 'TOTALMENTE_RESERVADA');
  });

  // ─────────────────────────── T1: o motor (stockService.js) ───────────────────────────
  let nloc = 0;
  const loc = async () => { const c = `E96L-${++nloc}-${++seq}`; return (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID; };
  const linha = async (m, l, lote = null) => (await dbGet(db, 'SELECT quantidade q FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id IS ? AND lote_id IS ?', [m, l, lote]))?.q;
  const ultimaMov = (m) => dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id=? ORDER BY id DESC LIMIT 1', [m]);
  const movOk = async (m, tipo, q, extra = {}, esperado = 201) => {
    const r = await mov(m, tipo, q, extra);
    assert.strictEqual(r.status, esperado, `${tipo} ${q}: ${JSON.stringify(r.body)}`);
    return r;
  };
  const desbloquear = (m, q) => como('ADMIN').post(`${API}/materiais/${m}/desbloquear`, { quantidade: q, motivo: 'e96', justificativa: 'teste da etapa 96' });
  const retrato = async (m) => JSON.stringify({
    m: await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id=?', [m]),
    l: await dbAll(db, 'SELECT id, localizacao_id, lote_id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? ORDER BY id', [m]),
    v: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n,
    r: await dbAll(db, 'SELECT id, quantidade, quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE material_id=? ORDER BY id', [m]),
  });

  // RN-01 — o motor grava a quantidade arredondada
  await test('[96 RN-01] 0,7 + 0,2 + 0,1 por ENTRADA -> fisico 1, o livro diz 1 e a tela diz 1', async () => {
    const m = await material(0);
    for (const q of [0.7, 0.2, 0.1]) await entrar(m, q);
    assert.strictEqual((await mat(m)).quantidade_atual, 1);
    assert.strictEqual((await ultimaMov(m)).saldo_posterior, 1);
    const g = await como('ADMIN').get(`${API}/materiais/${m}`);
    assert.strictEqual(g.status, 200, JSON.stringify(g.body));
    assert.strictEqual(g.body.quantidade_atual, 1);
  });
  await test('[96 RN-01] a linha do endereco e a do lote gravam 1 (0,7 + 0,2 + 0,1)', async () => {
    const A = await loc();
    const m = await material(0);
    for (const q of [0.7, 0.2, 0.1]) await movOk(m, 'ENTRADA', q, { localizacao_destino_id: A });
    assert.strictEqual(await linha(m, A), 1);
    assert.strictEqual((await mat(m)).quantidade_atual, 1);
    const ml = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [ml]);
    for (const q of [0.7, 0.2, 0.1]) await movOk(ml, 'ENTRADA', q, { lote: 'L96' });
    const lt = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [ml]);
    assert.ok(lt, 'premissa: o lote existe');
    const soma = await dbGet(db, 'SELECT SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [ml, lt.id]);
    assert.strictEqual(soma.q, 1);
    assert.strictEqual((await mat(ml)).quantidade_atual, 1);
  });
  await test('[96 RN-01] dez entradas de 0,1 -> 1; 0,3 - 0,1 -> 0,2; 0,7 - 0,6 -> 0,1', async () => {
    const a = await material(0);
    for (let i = 0; i < 10; i++) await entrar(a, 0.1);
    assert.strictEqual((await mat(a)).quantidade_atual, 1);
    const b = await material(0);
    await entrar(b, 0.3); await movOk(b, 'SAIDA', 0.1);
    assert.strictEqual((await mat(b)).quantidade_atual, 0.2);
    const c = await material(0);
    await entrar(c, 0.7); await movOk(c, 'SAIDA', 0.6);
    assert.strictEqual((await mat(c)).quantidade_atual, 0.1);
    assert.strictEqual((await ultimaMov(c)).saldo_posterior, 0.1);
  });
  await test('[96 RN-01] tres reservas 0,7 + 0,2 + 0,1 -> reservado 1 (sem livre fantasma); bloquear 0,7 + 0,2 + 0,1 -> bloqueado 1', async () => {
    const m = await material(0);
    await entrar(m, 1);
    for (const q of [0.7, 0.2, 0.1]) assert.strictEqual((await reservar(m, q)).status, 201);
    assert.strictEqual((await mat(m)).quantidade_reservada, 1);
    const fantasma = await mov(m, 'SAIDA', 1e-7);
    assert.strictEqual(fantasma.status, 400, `a saida do livre fantasma passou: ${JSON.stringify(fantasma.body)}`);
    const b = await material(0);
    await entrar(b, 1);
    for (const q of [0.7, 0.2, 0.1]) assert.strictEqual((await bloquear(b, q)).status, 200);
    assert.strictEqual((await mat(b)).quantidade_bloqueada, 1);
  });
  await test('[96 RN-01] AJUSTE sem localizacao: a linha padrao calculada em JS grava sem residuo (1 - 0,7 -> 0,3)', async () => {
    const A = await loc();
    const m = await material(0);
    await movOk(m, 'ENTRADA', 0.7, { localizacao_destino_id: A });
    await movOk(m, 'AJUSTE', 1);
    const outras = await dbAll(db, 'SELECT quantidade q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS NOT ? ORDER BY id', [m, A]);
    assert.deepStrictEqual(outras.map((r) => r.q), [0.3]);
    assert.strictEqual((await mat(m)).quantidade_atual, 1);
  });
  await test('[96 RN-01] AJUSTE com localizacao recalcula o total pela soma das linhas: 0,1 + 0,2 em dois enderecos -> total 0,3', async () => {
    // a SUM do SQLite 3.44 compensa a soma (0,7 + 0,2 + 0,1 da 1), mas 0,1 + 0,2 da 0.30000000000000004 — medido.
    const A = await loc(); const B = await loc(); const D = await loc();
    const m = await material(0);
    await movOk(m, 'ENTRADA', 0.1, { localizacao_destino_id: A });
    await movOk(m, 'ENTRADA', 0.2, { localizacao_destino_id: B });
    await movOk(m, 'AJUSTE', 0, { localizacao_destino_id: D }); // a contagem "aqui nao tem nada" dispara a soma
    assert.strictEqual((await mat(m)).quantidade_atual, 0.3);
    assert.strictEqual((await ultimaMov(m)).saldo_posterior, 0.3);
  });
  await test('[96 RN-01] varredura: nenhuma escrita incremental de quantidade em stockService.js fora de Q.qtdSql (com controle do padrao)', async () => {
    const fs = require('fs');
    const path = require('path');
    // Mudado na Etapa 96 Fase 5 (testes 2): a regex por linha virou tests/helpers/varreduraQuantidade.js — arquivo
    // inteiro, so o trecho dentro de Q.qtdSql(...) excluido, colunas de COLUNAS_LEGADO, qualquer forma da escrita.
    const V = require('../helpers/varreduraQuantidade');
    // controles positivos: cada forma da escrita crua e achada (e a embrulhada, o WHERE e o JS nao)
    const formas = [
      "await dbRun(db, 'UPDATE t SET quantidade = quantidade - ?, x = 1 WHERE id = ?');",
      'SET quantidade_reservada = MAX(0, COALESCE(quantidade_reservada,0) - ?),',
      'SET quantidade_atual =\n  quantidade_atual - ? WHERE id = ?', // em duas linhas
      "SET quantidade_atual = ${Q.qtdSql('quantidade_atual + ?')}, quantidade_reservada = quantidade_reservada + ? WHERE", // ao lado de uma embrulhada
      'SET quantidade_reservada = IFNULL(quantidade_reservada, 0) + ?',
      'SET quantidade_reservada = COALESCE( quantidade_reservada, 0.0) + ?',
      'SET quantidade_atual = ? + quantidade_atual',
      'SET quantidade_atual = (quantidade_atual - ?)',
      'SET quantidade_atendida = COALESCE(quantidade_entregue, quantidade_atendida, 0) + ?',
      'SET quantidade_atual = quantidade_atual - ${q}',
      'set quantidade = quantidade - ?',
    ];
    for (const x of formas) assert.strictEqual(V.escritasCruas(x).length, 1, `a forma nao foi achada: ${x}`);
    for (const x of ["SET quantidade = ${Q.qtdSql('quantidade - ?')}, x = 1", 'WHERE quantidade >= ? - 1e-9 AND quantidade_atual = ?',
      'item.quantidade_separada = novaSeparada - outra;']) {
      assert.deepStrictEqual(V.escritasCruas(x), [], `falso positivo: ${x}`);
    }
    assert.ok(V.COLUNAS.includes('quantidade_atendida') && V.COLUNAS.includes('quantidade_solicitada'), V.COLUNAS.join());
    const fonte = fs.readFileSync(path.join(__dirname, '../../services/almoxarifado/stockService.js'), 'utf8');
    assert.deepStrictEqual(V.escritasCruas(fonte), [], 'escritas cruas');
    // e o arquivo de verdade tem as embrulhadas — senao a varredura nao varreu
    assert.ok(V.embrulhadas(fonte) >= 50, `so ${V.embrulhadas(fonte)} escritas embrulhadas — a varredura esta lendo o arquivo certo?`);
    // (Fase 2, I4) as escritas ABSOLUTAS (`SET col = ?`) gravam um numero calculado em JS: lista nominal com o 1o
    // parametro de cada uma. `saldos.total` vem do ROUND da soma no SQL; `parseFloat(quantidade)` e `saldoPosterior`
    // vem da quantidade ja arredondada na porta; as outras passam por Q.qtd. Uma escrita absoluta nova muda a lista.
    const absolutas = [];
    const reAbs = /SET\s+(quantidade\w*)\s*=\s*\?[^[]*?\[\s*([^,\]]+)/g;
    let mm;
    while ((mm = reAbs.exec(fonte))) {
      const inicioLinha = fonte.lastIndexOf('\n', mm.index) + 1;
      if (/^\s*(\*|\/\/)/.test(fonte.slice(inicioLinha, mm.index))) continue;
      absolutas.push([mm[1], mm[2].trim()]);
    }
    assert.deepStrictEqual(absolutas, [
      ['quantidade_atual', 'saldos.total'], ['quantidade', 'Q.qtd(novaLinha)'], ['quantidade', 'parseFloat(quantidade)'],
      ['quantidade_atual', 'saldoPosterior'], ['quantidade_atual', 'saldoPosterior'],
      ['quantidade_atual', 'Q.qtd(ajusteSerieFisicoAnterior)'], ['quantidade_atual', 'Q.qtd(mov.saldo_anterior)'],
    ]);
  });

  await test('[96 RN-01] (Fase 5) varredura de services/almoxarifado inteiro: nenhuma escrita incremental de quantidade fora de Q.qtdSql', async () => {
    const fs = require('fs');
    const path = require('path');
    const V = require('../helpers/varreduraQuantidade');
    const dir = path.join(__dirname, '../../services/almoxarifado');
    const achados = {}; let total = 0;
    const arquivos = fs.readdirSync(dir).filter((a) => a.endsWith('.js'));
    for (const a of arquivos) {
      const fonte = fs.readFileSync(path.join(dir, a), 'utf8');
      const c = V.escritasCruas(fonte);
      if (c.length) achados[a] = c;
      total += V.embrulhadas(fonte);
    }
    assert.deepStrictEqual(achados, {}, 'escritas cruas');
    assert.ok(arquivos.includes('requisitionService.js') && arquivos.length >= 40, arquivos.join());
    assert.ok(total >= 75, `so ${total} escritas embrulhadas no diretorio`);
  });

  // RN-02 — o pedido que cabe passa, inclusive no legado escrito direto
  const legadoNaLinha = async (extra = {}) => {
    const A = await loc();
    const m = await material(0);
    if (extra.lote) await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m]);
    await movOk(m, 'ENTRADA', 1, extra.lote ? { lote: extra.lote, localizacao_destino_id: A } : { localizacao_destino_id: A });
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = ? WHERE material_id = ?', [TORTO, m]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    assert.strictEqual(await linha(m, A, extra.lote ? (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=?', [m])).id : null), TORTO, 'premissa: linha torta');
    return { m, A };
  };
  await test('[96 RN-02] legado torto na linha: SAIDA 1 com origem no endereco -> 201, linha 0 e fisico 0 (nao -1,1e-16)', async () => {
    const { m, A } = await legadoNaLinha();
    await movOk(m, 'SAIDA', 1, { localizacao_origem_id: A });
    assert.strictEqual(await linha(m, A), 0);
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
    assert.strictEqual((await ultimaMov(m)).saldo_posterior, 0);
  });
  await test('[96 RN-02] legado torto: SAIDA 1 sem origem deixa o fisico 0 (nao -1,1e-16)', async () => {
    const m = await legado();
    await movOk(m, 'SAIDA', 1);
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
  });
  await test('[96 RN-02] legado torto na linha: TRANSFERENCIA 1 de A para B -> 201, A 0 e B 1', async () => {
    const { m, A } = await legadoNaLinha();
    const B = await loc();
    await movOk(m, 'TRANSFERENCIA', 1, { localizacao_origem_id: A, localizacao_destino_id: B });
    assert.strictEqual(await linha(m, A), 0);
    assert.strictEqual(await linha(m, B), 1);
  });
  await test('[96 RN-02] legado torto no lote: SAIDA 1 do lote -> 201', async () => {
    const { m } = await legadoNaLinha({ lote: 'L96T' });
    const lt = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m]);
    await movOk(m, 'SAIDA', 1, { lote_id: lt.id });
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
  });
  await test('[96 RN-02] legado torto: AJUSTE_NEGATIVO 1 e PERDA 1 -> 201', async () => {
    for (const tipo of ['AJUSTE_NEGATIVO', 'PERDA']) {
      const m = await legado();
      await movOk(m, tipo, 1);
      assert.strictEqual((await mat(m)).quantidade_atual, 0, tipo);
    }
  });
  await test('[96 RN-02] legado torto no bloqueado: desbloquear 1 -> 200, bloqueado 0', async () => {
    const m = await material(0);
    await entrar(m, 1);
    assert.strictEqual((await bloquear(m, 1)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = ? WHERE id = ?', [TORTO, m]);
    const d = await desbloquear(m, 1);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual((await mat(m)).quantidade_bloqueada, 0);
  });
  await test('[96 RN-02] (Fase 2, K1) estornar AJUSTE 0,7 -> 1 depois de SAIDA 0,7 -> 200, a linha de A 0', async () => {
    const A = await loc();
    const m = await material(0);
    await movOk(m, 'ENTRADA', 0.7, { localizacao_destino_id: A });
    const aj = await movOk(m, 'AJUSTE', 1, { localizacao_destino_id: A });
    await movOk(m, 'SAIDA', 0.7, { localizacao_origem_id: A });
    assert.strictEqual(await linha(m, A), 0.3, 'premissa: a linha ficou 0,3 limpa');
    const idAjuste = (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE'", [m])).id;
    assert.ok(aj && idAjuste);
    const c = await como('ADMIN').post(`${API}/movimentacoes/${idAjuste}/cancelar`, { motivo: 'teste da etapa 96' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await linha(m, A), 0);
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
    const est = await ultimaMov(m);
    assert.deepStrictEqual([est.tipo, est.saldo_anterior, est.saldo_posterior], ['ESTORNO', 0.3, 0]);
  });
  await test('[96 RN-02] (Fase 2, I1) estorno de TRANSFERENCIA com o destino torto -> 200', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(0);
    await movOk(m, 'ENTRADA', 1, { localizacao_destino_id: A });
    await movOk(m, 'TRANSFERENCIA', 1, { localizacao_origem_id: A, localizacao_destino_id: B });
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = ? WHERE material_id = ? AND localizacao_id = ?', [TORTO, m, B]);
    const t = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'TRANSFERENCIA'", [m]);
    const c = await como('ADMIN').post(`${API}/movimentacoes/${t.id}/cancelar`, { motivo: 'teste da etapa 96' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await linha(m, B), 0);
    assert.strictEqual(await linha(m, A), 1);
  });
  await test('[96 RN-02] (Fase 2, I1) AJUSTE sem localizacao para o total retido exato (reservado 0,1 + bloqueado 0,2) -> 201', async () => {
    const m = await material(0);
    await entrar(m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 0.1, quantidade_bloqueada = 0.2 WHERE id = ?', [m]);
    assert.notStrictEqual(0.1 + 0.2, 0.3, 'premissa: a soma das retencoes e torta neste runtime');
    await movOk(m, 'AJUSTE', 0.3);
    assert.strictEqual((await mat(m)).quantidade_atual, 0.3);
  });

  // RN-03 — a folga nao inventa estoque
  await test('[96 RN-03] fisico 0,2 limpo: SAIDA 0,200001 -> 400 "Saldo insuficiente. Disponivel: 0.2 PC", nada gravado', async () => {
    const m = await material(0); await entrar(m, 0.2);
    const antes = await retrato(m);
    const r = await mov(m, 'SAIDA', 0.200001);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Saldo insuficiente. Disponível: 0.2 PC');
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-03] reserva 0,200001 com 0,2 -> 400 "Saldo disponivel insuficiente: 0.2", nada gravado', async () => {
    const m = await material(0); await entrar(m, 0.2);
    const antes = await retrato(m);
    const r = await reservar(m, 0.200001);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Saldo disponível insuficiente: 0.2');
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-03] desbloquear 0,200001 com bloqueado 0,2 -> 400, nada gravado', async () => {
    const m = await material(0); await entrar(m, 1);
    assert.strictEqual((await bloquear(m, 0.2)).status, 200);
    const antes = await retrato(m);
    const r = await desbloquear(m, 0.200001);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Quantidade bloqueada insuficiente: 0.2');
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-03] transferencia 0,200001 de um endereco com 0,2 -> 400 "Saldo insuficiente na localizacao de origem", nada gravado', async () => {
    const A = await loc(); const B = await loc();
    const m = await material(0);
    await movOk(m, 'ENTRADA', 0.2, { localizacao_destino_id: A });
    const antes = await retrato(m);
    const r = await mov(m, 'TRANSFERENCIA', 0.200001, { localizacao_origem_id: A, localizacao_destino_id: B });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Saldo insuficiente na localização de origem');
    // a transferencia pode criar a linha de destino vazia antes de recusar? o retrato diz se mudou
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-03] a porta arredonda antes da folga: SAIDA 0,2000006 com 0,2 -> 400 (vira 0,200001); 0,2000004 -> 201 (vira 0,2)', async () => {
    const m = await material(0); await entrar(m, 0.2);
    const r = await mov(m, 'SAIDA', 0.2000006);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    await movOk(m, 'SAIDA', 0.2000004);
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
    assert.strictEqual((await ultimaMov(m)).quantidade, 0.2, 'o livro diz o numero que o saldo moveu');
  });

  // RN-04 — a quantidade pedida e arredondada na porta
  await test('[96 RN-04] ENTRADA 1,0000004 -> fisico 1 e a movimentacao com quantidade 1', async () => {
    const m = await material(0);
    await movOk(m, 'ENTRADA', 1.0000004);
    assert.strictEqual((await mat(m)).quantidade_atual, 1);
    const u = await ultimaMov(m);
    assert.deepStrictEqual([u.quantidade, u.saldo_anterior, u.saldo_posterior], [1, 0, 1]);
  });
  await test('[96 RN-04] ENTRADA 0,0000004 -> 400 "material_id, tipo e quantidade sao obrigatorios", nada gravado', async () => {
    const m = await material(0);
    const antes = await retrato(m);
    const r = await mov(m, 'ENTRADA', 0.0000004);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'material_id, tipo e quantidade são obrigatórios');
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-04] POST /reservas 0,0000004 -> 400 "Quantidade da reserva deve ser maior que zero"', async () => {
    const m = await material(0); await entrar(m, 1);
    const r = await reservar(m, 0.0000004);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Quantidade da reserva deve ser maior que zero');
  });
  await test('[96 RN-04] (Fase 2, menor) AJUSTE 0,0000004: com localizacao zera a linha; sem localizacao cai na Z1', async () => {
    const A = await loc();
    const m = await material(0);
    await movOk(m, 'ENTRADA', 0.5, { localizacao_destino_id: A });
    await movOk(m, 'AJUSTE', 0.0000004, { localizacao_destino_id: A });
    assert.strictEqual(await linha(m, A), 0);
    assert.strictEqual((await mat(m)).quantidade_atual, 0);
    const n = await material(0); await entrar(n, 0.5);
    const r = await mov(n, 'AJUSTE', 0.0000004);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'material_id, tipo e quantidade são obrigatórios');
    assert.strictEqual((await mat(n)).quantidade_atual, 0.5);
  });
  await test('[96 RN-04] (Fase 2, menor) pelo servico: quantidade null, \'\' e true -> Z1, nunca 0 ou 1', async () => {
    const stockService = require('../../services/almoxarifado/stockService');
    const m = await material(0); await entrar(m, 5);
    for (const q of [null, '', true]) {
      await assert.rejects(() => stockService.registrarMovimentacao(db, { ...USERS.ADMIN }, { material_id: m, tipo: 'SAIDA', quantidade: q, motivo: 'e96' }),
        (e) => e.status === 400 && e.message === 'material_id, tipo e quantidade são obrigatórios', `quantidade ${JSON.stringify(q)}`);
    }
    assert.strictEqual((await mat(m)).quantidade_atual, 5);
  });

  // RN-05 — a mensagem mostra o numero arredondado
  await test('[96 RN-05] legado torto e pedido que NAO cabe: as literais dizem 1, nao 0.9999999999999999', async () => {
    const m = await legado();
    const s = await mov(m, 'SAIDA', 2);
    assert.strictEqual(s.status, 400); assert.strictEqual(s.body.error, 'Saldo insuficiente. Disponível: 1 PC');
    const r = await reservar(m, 2);
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Saldo disponível insuficiente: 1');
    const b = await material(0); await entrar(b, 1);
    assert.strictEqual((await bloquear(b, 1)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = ? WHERE id = ?', [TORTO, b]);
    const d = await desbloquear(b, 2);
    assert.strictEqual(d.status, 400); assert.strictEqual(d.body.error, 'Quantidade bloqueada insuficiente: 1');
  });
  await test('[96 RN-05] o lote em dois enderecos (0,1 + 0,2, colunas limpas) que nao cabe: "Saldo insuficiente no lote L96M. Disponivel: 0.3 PC"', async () => {
    // a soma das linhas do lote e uma SUM do SQLite: 0,1 + 0,2 da 0.30000000000000004 sem o Q.qtd na mensagem
    const A = await loc(); const B = await loc();
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m]);
    await movOk(m, 'ENTRADA', 0.1, { lote: 'L96M', localizacao_destino_id: A });
    await movOk(m, 'ENTRADA', 0.2, { lote: 'L96M', localizacao_destino_id: B });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [m]); // o material cabe; o lote nao
    const lt = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m]);
    const r = await mov(m, 'SAIDA', 2, { lote_id: lt.id });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Saldo insuficiente no lote L96M. Disponível: 0.3 PC');
  });

  // ─────────────────────────── Fase 5, R2 — o residuo da ultima reserva ───────────────────────────
  // Tres reservas legadas de 1/3 contra o reservado 1: cada uma sai pelo saldo arredondado (0,333333) e o reservado,
  // gravado arredondado, terminava em 0,000001 sem reserva ATIVA — SAIDA 1 com fisico 1 recusada ("Disponivel:
  // 0.999999"). Antes da 96: 5,5e-17 -> 0. Montado por escritor direto (o motor de hoje nao grava 1/3).
  const tresReservasTerco = async () => {
    const m = await material(0); await entrar(m, 1);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await reservar(m, 0.3);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      ids.push(r.body.id);
    }
    const T = 1 / 3;
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade = ? WHERE material_id = ?', [T, m]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = ? WHERE id = ?', [T + T + T, m]);
    return { m, ids };
  };
  await test('[96 RN-02] (Fase 5, R2) liberar tres reservas legadas de 1/3 (reservado 1) -> reservado 0, e a SAIDA de 1 passa', async () => {
    const { m, ids } = await tresReservasTerco();
    for (const id of ids) {
      const l = await como('ADMIN').post(`${API}/reservas/${id}/liberar`, { motivo: 'e96 f5' });
      assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    }
    assert.strictEqual((await mat(m)).quantidade_reservada, 0);
    const s = await mov(m, 'SAIDA', 1);
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  });
  await test('[96 RN-02] (Fase 5, R2) consumir pela SAIDA tres reservas legadas de 1/3 (0,333333 cada) -> reservado 0, reservas CONSUMIDA', async () => {
    const { m, ids } = await tresReservasTerco();
    for (const id of ids) {
      const s = await mov(m, 'SAIDA', 0.333333, { reserva_id: id });
      assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    }
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0.000001, quantidade_reservada: 0, quantidade_bloqueada: 0 });
    const st = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE material_id = ? ORDER BY id', [m]);
    assert.deepStrictEqual(st.map((x) => x.status), ['CONSUMIDA', 'CONSUMIDA', 'CONSUMIDA']);
  });
  await test('[96 RN-03] (Fase 5, R2) o residuo so some sem reserva ATIVA: com outra reserva de 0,00005 ativa, liberar a de 0,3 deixa 0,00005', async () => {
    const m = await material(0); await entrar(m, 1);
    const a = (await reservar(m, 0.3)).body.id;
    const b = await reservar(m, 0.00005);
    assert.strictEqual(b.status, 201, JSON.stringify(b.body));
    const l = await como('ADMIN').post(`${API}/reservas/${a}/liberar`, { motivo: 'e96 f5' });
    assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    assert.strictEqual((await mat(m)).quantidade_reservada, 0.00005);
  });

  // ─────────────────────────── Fase 5, R3 — o disponivel da pre-checagem e o do claim ───────────────────────────
  // getSaldoDisponivel recalculava em JS (toFixed) e discordava do ROUND do SQLite no meio exato: legado 0,0010995 dava
  // 0,001099 aqui e 0,0011 no claim — a reserva de 0,0011 passava, a SAIDA de 0,0011 era recusada.
  const MEIO = 0.0010995;
  await test('[96 RN-05] (Fase 5, R3) legado no meio exato (0,0010995): a recusa diz o numero do claim (0,0011), nao o do JS (0,001099)', async () => {
    const m = await legado(MEIO);
    const s = await mov(m, 'SAIDA', 0.002);
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.error, 'Saldo insuficiente. Disponível: 0.0011 PC');
    const r = await reservar(m, 0.002);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Saldo disponível insuficiente: 0.0011');
  });
  await test('[96 RN-02] (Fase 5, R3) legado no meio exato: a SAIDA de 0,0011 concorda com a reserva de 0,0011 (as duas passam)', async () => {
    const m1 = await legado(MEIO);
    assert.strictEqual((await reservar(m1, 0.0011)).status, 201, 'premissa: o claim da reserva aceita 0,0011');
    const m2 = await legado(MEIO);
    const s = await mov(m2, 'SAIDA', 0.0011);
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
  });
  await test('[96 RN-05] (Fase 5) estorno de BLOQUEIO com o bloqueado torto abaixo do bloqueio -> 400 "(quantidade bloqueada: 0.2)"', async () => {
    const m = await material(0); await entrar(m, 1);
    assert.strictEqual((await bloquear(m, 0.3)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = ? WHERE id = ?', [0.20000000000000004, m]);
    const b = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO'", [m]);
    const c = await como('ADMIN').post(`${API}/movimentacoes/${b.id}/cancelar`, { motivo: 'teste da etapa 96' });
    assert.strictEqual(c.status, 400, JSON.stringify(c.body));
    assert.strictEqual(c.body.error, 'Não é possível estornar: o bloqueio já foi desfeito (quantidade bloqueada: 0.2)');
  });

  // ─────────────────────────── Fase 5, testes 1 — as guardas de folga que ninguem testava ───────────────────────────
  // A revisao sabotou as sete juntas e a suite ficou 335/335. Um caso por guarda, cada um com o legado escrito direto
  // (ou, na pre-checagem do bloqueado, colunas LIMPAS cuja diferenca sai torta), derrubado pela sabotagem da sua guarda.
  const stockServiceF5 = require('../../services/almoxarifado/stockService');
  const motorF5 = (p) => stockServiceF5.registrarMovimentacao(db, { ...USERS.ADMIN }, { motivo: 'e96 f5', justificativa: 'teste da etapa 96', ...p });
  await test('[96 RN-02] (Fase 5) pre-checagem do bloqueado, colunas LIMPAS: fisico 0,3 e bloqueado 0,1 -> SAIDA 0,2 -> 201', async () => {
    const m = await material(0); await entrar(m, 0.3);
    assert.strictEqual((await bloquear(m, 0.1)).status, 200);
    const s = await mov(m, 'SAIDA', 0.2);
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    assert.deepStrictEqual({ ...(await mat(m)) }, { quantidade_atual: 0.1, quantidade_reservada: 0, quantidade_bloqueada: 0.1 });
  });
  await test('[96 RN-02] (Fase 5) LIBERACAO_INSPECAO de 1 com em_inspecao legado 0.9999… -> passa, em_inspecao 0', async () => {
    const m = await material(0); await entrar(m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = ? WHERE id = ?', [TORTO, m]);
    await motorF5({ material_id: m, tipo: 'LIBERACAO_INSPECAO', quantidade: 1 });
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_em_inspecao q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 0);
  });
  await test('[96 RN-02] (Fase 5) RETORNO_TERCEIRO de 1 com em_terceiros legado 0.9999… -> passa, em_terceiros 0', async () => {
    const m = await material(0); await entrar(m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = ? WHERE id = ?', [TORTO, m]);
    await motorF5({ material_id: m, tipo: 'RETORNO_TERCEIRO', quantidade: 1 });
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_em_terceiros q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 0);
  });
  await test('[96 RN-02] (Fase 5) PERDA_TERCEIRO de 1 com em_terceiros e fisico legados 0.9999… -> passa (as duas folgas do claim), os dois 0', async () => {
    const m = await material(0); await entrar(m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = ?, quantidade_atual = ? WHERE id = ?', [TORTO, TORTO, m]);
    await motorF5({ material_id: m, tipo: 'PERDA_TERCEIRO', quantidade: 1 });
    const r = await dbGet(db, 'SELECT quantidade_em_terceiros t, quantidade_atual a FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.deepStrictEqual([r.t, r.a], [0, 0]);
  });
  await test('[96 RN-02] (Fase 5) PERDA_TERCEIRO de 1 com SO o fisico legado 0.9999… (em_terceiros 1 limpo) -> passa', async () => {
    const m = await material(0); await entrar(m, 1);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 1, quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    await motorF5({ material_id: m, tipo: 'PERDA_TERCEIRO', quantidade: 1 });
    const r = await dbGet(db, 'SELECT quantidade_em_terceiros t, quantidade_atual a FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.deepStrictEqual([r.t, r.a], [0, 0]);
  });
  await test('[96 RN-02] (Fase 5) estornar o BLOQUEIO de 1 com o bloqueado legado 0.9999… -> 200, bloqueado 0', async () => {
    const m = await material(0); await entrar(m, 2);
    assert.strictEqual((await bloquear(m, 1)).status, 200);
    const b = await ultimaMov(m);
    assert.strictEqual(b.tipo, 'BLOQUEIO', 'premissa: a ultima movimentacao e o BLOQUEIO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = ? WHERE id = ?', [TORTO, m]);
    const c = await como('ADMIN').post(`${API}/movimentacoes/${b.id}/cancelar`, { motivo: 'teste da etapa 96' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual((await mat(m)).quantidade_bloqueada, 0);
  });
  await test('[96 RN-02] (Fase 5) piso de ajustarSaldoExistente: estornar a ENTRADA de 1 com a linha do LOTE legada 0.9999… -> 200, linha 0', async () => {
    const A = await loc();
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m]);
    await movOk(m, 'ENTRADA', 1, { lote: 'L96F5', localizacao_destino_id: A });
    const e = await ultimaMov(m);
    assert.ok(e.lote_id, 'premissa: a entrada tem lote');
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = ? WHERE material_id = ?', [TORTO, m]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    const c = await como('ADMIN').post(`${API}/movimentacoes/${e.id}/cancelar`, { motivo: 'teste da etapa 96' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual(await linha(m, A, e.lote_id), 0);
  });

  // ─────────────────────────── Fase 5, testes 3 — RESERVADA_MENOS_SQL grava arredondado ───────────────────────────
  await test('[96 RN-01] (Fase 5) reserva 0,3, liberar 0,1 -> o reservado do material e 0,2 (RESERVADA_MENOS_SQL arredonda), nao 0.19999999999999998', async () => {
    const m = await material(0); await entrar(m, 1);
    const r = await reservar(m, 0.3);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const l = await como('ADMIN').post(`${API}/reservas/${r.body.id}/liberar`, { quantidade: 0.1, motivo: 'e96 f5' });
    assert.strictEqual(l.status, 200, JSON.stringify(l.body));
    assert.strictEqual((await mat(m)).quantidade_reservada, 0.2);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
