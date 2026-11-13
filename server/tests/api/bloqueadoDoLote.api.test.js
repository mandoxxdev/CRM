/**
 * Etapa 217 (T0) — a entrega e o automatico nao tiram a peca bloqueada do lote (C466, 2a parte; C503; B1434-B1441).
 *
 * O "retido do lote" (`retidoDoLote.js`) = quarentena/avulso pelo livro (`bloqueioPorLote`, Etapa 209) + reprovacao da inspecao pelo
 * documento (sem os tres carimbos) + em terceiros pelo item da remessa enviada; cada familia so vale se a soma por lote couber no total
 * do material (B1436), e o retido nunca passa do fisico livre do lote (B1435). Dois leitores com a mesma regua: `lotesParaOAutomatico`
 * (a entrega e a conferencia da 206) e `loteImpedidoSql` (a aprovacao e a separacao da 205).
 *
 * Cobre: RN-217.01 b (servico), .02, .03, .04, .06, .07, .08, .09 (sorteio), .11 e .12 (integracao, rota e servico). A RN-217.01 a e a
 * reescrita do "[C466, limitacao documentada]" em `entregaAutomaticaPeloLote.api.test.js`; a RN-217.05 e a .10, a reescrita da RN-209.09
 * em `bloqueioSabeOLote.api.test.js`.
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa217-entrega-nao-tira-peca-bloqueada.md
 *
 * Executar: cd server && node tests/api/bloqueadoDoLote.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const returnService = require('../../services/almoxarifado/returnService');
const thirdPartyService = require('../../services/almoxarifado/thirdPartyService');
const lotService = require('../../services/almoxarifado/lotService');
const { loteImpedidoSql, fraseLoteImpedido } = require('../../services/almoxarifado/loteImpedido');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 217', role: 'admin', is_superadmin: 1, email: 'a217@t.com' },
  SOL: { id: 21731, nome: 'Solic 217', email: 's217@t.com' },
  ALMOX: { id: 21732, nome: 'Almox 217', role: 'user', email: 'x217@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const ADMIN = USERS.ADMIN;
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 217 (T0): o bloqueado do lote — automatico, aprovacao e separacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM217', nome: 'Almox 217' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  const loc = async (codigo) => {
    const r = await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${r.status} ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const B01 = await loc('Z217-B01'); const P01 = await loc('Z217-P01');

  const material = async ({ lote = 1 } = {}) => {
    const c = `E217-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = (m, q, lote, destino = P01.id) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA',
    quantidade: q, motivo: 'e217', localizacao_destino_id: destino, lote }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const status = async (m, codigo, st) => lotService.mudarStatusLote(db, ADMIN, await loteId(m, codigo), st, 'teste 217');
  const sair = async (m, q, codigo, origem = P01.id) => {
    await ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q, motivo: 'e217',
      justificativa: 'teste 217', localizacao_origem_id: origem, lote_id: await loteId(m, codigo) }), 201);
    return dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC", [m.id]);
  };
  // quarentena de q pecas do lote: sai q do lote e volta para Quarentena citando a saida (o BLOQUEIO herda o lote, Etapa 209)
  const quarentena = async (m, q, codigo, local = P01.id) => {
    const s = await sair(m, q, codigo, local);
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: q, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: s.id, localizacao_id: local });
  };
  // reprovacao pela inspecao: entrada do lote, QUARENTENA (retido do material) + item de recebimento do lote, decisao aprovada/reprovada
  const inspecionar = async (m, codigo, aprovada, reprovada) => {
    const q = aprovada + reprovada;
    await entrar(m, q, codigo);
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'QUARENTENA', quantidade: q, motivo: 'e217' });
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-217-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?, ?, ?, ?, ?, ?)`, [rec, m.id, q, q, await loteId(m, codigo), q])).lastID;
    await inspectionService.decidirInspecao(db, ADMIN, item, { quantidade_aprovada: aprovada, quantidade_reprovada: reprovada,
      observacoes: 'teste 217' });
    return (await dbGet(db, 'SELECT id FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ?', [item])).id;
  };
  const remessa = async (m, codigo, q, { enviar = true } = {}) => {
    const r = await thirdPartyService.criarRemessa(db, ADMIN, { fornecedor_nome: 'Galvanizadora 217', tipo_servico: 'Galvanizacao',
      itens: [{ material_id: m.id, quantidade: q, lote_id: await loteId(m, codigo) }] });
    if (enviar) await thirdPartyService.enviarRemessa(db, ADMIN, r.id);
    return { remessaId: r.id, itemId: r.itens[0].id };
  };
  const auto = async (m) => (await requisitionService.lotesParaOAutomatico(db, m.id, new Map(), new Map()))
    .map((l) => [l.lote_id, Number(l.saldo)]);
  const autoCod = async (m) => {
    const ls = await requisitionService.lotesParaOAutomatico(db, m.id, new Map(), new Map());
    const cods = new Map((await dbAll(db, 'SELECT id, codigo FROM lotes_almoxarifado WHERE material_id = ?', [m.id])).map((x) => [x.id, x.codigo]));
    return ls.map((l) => [cods.get(l.lote_id), Number(l.saldo)]);
  };
  const impSql = async (m) => Number((await dbGet(db, `SELECT ${loteImpedidoSql('m')} AS q FROM materiais_almoxarifado m WHERE m.id = ?`,
    [m.id])).q);
  const saldo = async (m) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E217S-${++seq}`])).lastID;
    const itId = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,1,0,0,0)`, [R, m.id])).lastID;
    const sd = await requisitionService.saldoDisponivelParaItem(db, await dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id = ?', [itId]));
    return { disponivel: sd.disponivel, lote_impedido: sd.lote_impedido, disponivel_liberado: sd.disponivel_liberado };
  };
  const criar = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-217', itens: [{ material_id: m.id, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    return { R: r.body.id, item };
  };
  const reqDireta = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E217-${++seq}`])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
    return { R, item };
  };
  const reservas = async (R) => (await dbAll(db, `SELECT quantidade, status FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? ORDER BY id`, [R])).map((x) => [Number(x.quantidade), x.status]);
  const livro = async (R, m) => (await dbAll(db, `SELECT mv.tipo, lt.codigo as lote, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN lotes_almoxarifado lt ON lt.id = mv.lote_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo IN ('SAIDA', 'ENTRADA') ORDER BY mv.id`, [R, m.id]))
    .map((x) => [x.tipo, x.lote || null, Number(x.q)]);
  const linhas = async (m) => (await dbAll(db, `SELECT lt.codigo as lote, SUM(s.quantidade) q FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id WHERE s.material_id = ? GROUP BY lt.codigo ORDER BY lt.codigo`, [m.id]))
    .filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.lote || '-'}=${Number(x.q)}`);

  await test('[B1439] lotesParaOAutomatico exportada', async () => {
    assert.strictEqual(typeof requisitionService.lotesParaOAutomatico, 'function');
  });

  // ── RN-217.01 b: a quarentena (pelo servico) ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-217.01 b, servico] L1 (5 dias) 3 e L2 (45 dias) 3; sai 3 de L1 e volta 1 para Quarentena: o automatico ve so L2 3 (L1 tem 1, bloqueada)', async () => {
    const m = await material();
    await entrar(m, 3, 'L1', B01.id); await entrar(m, 3, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const s = await sair(m, 3, 'L1', B01.id);
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: 1, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: s.id, localizacao_id: B01.id });
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=3'], 'premissa: a peca da quarentena voltou para L1');
    assert.deepStrictEqual(await autoCod(m), [['L2', 3]]);
  });

  // ── RN-217.02: a reprovacao da inspecao ───────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-217.02] L1 (5 dias) 5 com 2 reprovadas na inspecao (o lote segue ATIVO) e L2 (45 dias) 5: o automatico ve L1 3, L2 5', async () => {
    const m = await material();
    await inspecionar(m, 'L1', 3, 2);
    await entrar(m, 5, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?', [await loteId(m, 'L1')])).status, 'ATIVO',
      'premissa: a reprovacao nao muda o status do lote (Achado 1)');
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id])).b), 2);
    assert.deepStrictEqual(await autoCod(m), [['L1', 3], ['L2', 5]]);
  });
  await test('[RN-217.02 b] cada um dos tres carimbos tira a reprovacao do lote; a NC aceita + o DESBLOQUEIO devolvem L1 5', async () => {
    for (const carimbo of ['liberacao_nc_em', 'devolucao_fornecedor_em', 'sucateamento_em']) { // eslint-disable-line no-restricted-syntax
      const m = await material(); // eslint-disable-line no-await-in-loop
      const insp = await inspecionar(m, 'L1', 3, 2); // eslint-disable-line no-await-in-loop
      await validade(m, 'L1', dia(5)); // eslint-disable-line no-await-in-loop
      assert.deepStrictEqual(await autoCod(m), [['L1', 3]], `${carimbo}: premissa`); // eslint-disable-line no-await-in-loop
      await dbRun(db, `UPDATE inspecoes_recebimento_almoxarifado SET ${carimbo} = CURRENT_TIMESTAMP WHERE id = ?`, [insp]); // eslint-disable-line no-await-in-loop
      if (carimbo === 'liberacao_nc_em') {
        await inspectionService.desbloquearMaterial(db, ADMIN, m.id, { quantidade: 2, justificativa: 'NC aceita 217' }); // eslint-disable-line no-await-in-loop
      }
      assert.deepStrictEqual(await autoCod(m), [['L1', 5]], carimbo); // eslint-disable-line no-await-in-loop
    }
  });

  // ── RN-217.03: em terceiros ───────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-217.03] L1 (5 dias) 5 e L2 (45 dias) 5: remessa de 2 do L1 criada (L1 5) -> enviada (L1 3, o saldo do lote continua 5) -> retorno de 2 (L1 5)', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 5, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r = await remessa(m, 'L1', 2, { enviar: false });
    assert.deepStrictEqual(await autoCod(m), [['L1', 5], ['L2', 5]], 'item nao enviado nao retem');
    await thirdPartyService.enviarRemessa(db, ADMIN, r.remessaId);
    assert.deepStrictEqual(await linhas(m), ['L1=5', 'L2=5'], 'premissa: a remessa nao baixa o lote (Achado 2)');
    assert.deepStrictEqual(await autoCod(m), [['L1', 3], ['L2', 5]]);
    await remessa(m, 'L1', 1, { enviar: false });
    assert.deepStrictEqual(await autoCod(m), [['L1', 3], ['L2', 5]], 'outro item do L1 criado e nao enviado nao retem (nem derruba a familia)');
    await thirdPartyService.registrarRetorno(db, ADMIN, r.remessaId, { itens: [{ item_remessa_id: r.itemId, material_id: m.id, quantidade: 2,
      localizacao_destino_id: P01.id }] });
    assert.deepStrictEqual(await autoCod(m), [['L1', 5], ['L2', 5]]);
  });

  // ── RN-217.04: a aprovacao e a separacao (a conta da 205) ─────────────────────────────────────────────────────────────────────
  const montar04 = async () => {
    const m = await material();
    await entrar(m, 4, 'L1'); await quarentena(m, 2, 'L1');
    await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    return m;
  };
  await test('[RN-217.04] L1 ATIVO 4 com 2 em quarentena nele e L2 BLOQUEADO 6: disponivel 8, lote_impedido 6 (era 4), liberado 2', async () => {
    const m = await montar04();
    assert.deepStrictEqual(await saldo(m), { disponivel: 8, lote_impedido: 6, disponivel_liberado: 2 });
    assert.strictEqual(await impSql(m), 6);
  });
  await test('[RN-217.04 a-c, rota] requisicao de 4: aprovar reserva 2 (PARCIALMENTE_RESERVADA); fila e detalhe separavel 2; separar 3 -> 400 "Nao entram 6 un"', async () => {
    const m = await montar04();
    const { R, item } = await criar(m, 4);
    const ap = await ok(como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {}));
    assert.strictEqual(ap.body.status, 'PARCIALMENTE_RESERVADA');
    assert.deepStrictEqual(await reservas(R), [[2, 'ATIVA']]);
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((f) => Number(f.id) === Number(R));
    assert.strictEqual(fila.itens[0].separavel, 2, JSON.stringify(fila.itens[0]));
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.quantidade_separavel, 2); assert.strictEqual(det.lote_impedido, 6);
    const r3 = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: 3 }] });
    assert.strictEqual(r3.status, 400, JSON.stringify(r3.body));
    assert.ok(r3.body.error.startsWith(`${m.nome}: não é possível separar 3 un. Máximo: 2 `), r3.body.error);
    assert.ok(r3.body.error.endsWith(fraseLoteImpedido(6, 'un')), r3.body.error);
  });
  await test('[RN-217.04 d] a peca bloqueada DENTRO do lote impedido: o numero e o de hoje (com o lote no BLOQUEIO = sem)', async () => {
    const m = await material();
    await entrar(m, 4, 'L1'); await quarentena(m, 2, 'L1'); await status(m, 'L1', 'BLOQUEADO');
    await entrar(m, 6, 'L2');
    const com = await saldo(m);
    assert.deepStrictEqual(com, { disponivel: 8, lote_impedido: 2, disponivel_liberado: 6 });
    await dbRun(db, "UPDATE movimentacoes_almoxarifado SET lote_id = NULL WHERE material_id = ? AND tipo = 'BLOQUEIO'", [m.id]);
    assert.deepStrictEqual(await saldo(m), com);
  });

  // ── RN-217.06/07: o limite por familia (B1436) ────────────────────────────────────────────────────────────────────────────────
  await test('[RN-217.06] reprovacao 3 no L2 + quarentena 2 no L1 (total 5): os dois retem; liberacao avulsa sem lote de 3 -> total 2: a reprovacao deixa de reter, o livro segue', async () => {
    const m = await material();
    await inspecionar(m, 'L2', 2, 3);
    await entrar(m, 4, 'L1'); await quarentena(m, 2, 'L1');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    assert.strictEqual(Number((await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id])).b), 5);
    assert.deepStrictEqual(await autoCod(m), [['L1', 2], ['L2', 2]]);
    await inspectionService.desbloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso sem lote 217' });
    assert.deepStrictEqual(await autoCod(m), [['L1', 2], ['L2', 5]], 'a reprovacao (velha) volta para o material; a quarentena fica');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 1 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(await autoCod(m), [['L1', 4], ['L2', 5]], 'controle: o livro acima do total -> nenhum lote retem');
  });
  await test('[RN-217.07] item enviado de 2 no L1: em_terceiros 1 (abaixo da soma) -> L1 nao retem; em_terceiros 2 -> retem 2', async () => {
    const m = await material();
    await entrar(m, 5, 'L1'); await validade(m, 'L1', dia(5));
    await remessa(m, 'L1', 2);
    assert.deepStrictEqual(await autoCod(m), [['L1', 3]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 1 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(await autoCod(m), [['L1', 5]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 2 WHERE id = ?', [m.id]);
    assert.deepStrictEqual(await autoCod(m), [['L1', 3]]);
  });

  // ── RN-217.08: sem controle de lote ───────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-217.08] material SEM controle de lote com L1 2 em quarentena e L2 BLOQUEADO: loteImpedidoSql 0 (B1371)', async () => {
    const m = await material({ lote: 0 });
    await entrar(m, 4, 'L1'); await quarentena(m, 2, 'L1');
    await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual(await impSql(m), 0);
  });

  // ── RN-217.11: a conferencia da 206 com a regua nova ──────────────────────────────────────────────────────────────────────────
  await test('[RN-217.11] L1 ATIVO 2 todo em quarentena e L2 BLOQUEADO 3; entrega de 1 -> 400 da 206 (faltam 1 un, L2), nada baixado', async () => {
    const m = await material();
    await entrar(m, 2, 'L1'); await quarentena(m, 2, 'L1');
    await entrar(m, 3, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const { R, item } = await reqDireta(m, 1);
    // separada ANTES (a separacao de hoje ja recusa: o liberado e 0) — o que interessa e a porta da entrega
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [R]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 1 WHERE id = ?', [item]);
    const r = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: 1 }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, requisitionService.fraseEntregaLoteImpedido(m.nome, 1, 'un', 1,
      [{ codigo: 'L2', status: 'BLOQUEADO', data_validade: null, quantidade: 3 }]));
    assert.deepStrictEqual(await livro(R, m), [], 'nada baixado');
    assert.deepStrictEqual(await linhas(m), ['L1=2', 'L2=3']);
  });

  // ── RN-217.12: integracao, pela rota e pelo servico ───────────────────────────────────────────────────────────────────────────
  await test('[RN-217.12 a, rota] R1 entregue de L1 -> devolucao Quarentena (rota) -> GET bloqueado-por-lote L1 1 -> R2: aprovar, fila, separar, entregar -> sai L2', async () => {
    const m = await material();
    await entrar(m, 3, 'L1', B01.id); await entrar(m, 3, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await criar(m, 3);
    await ok(como('ADMIN').put(`${API}/requisicoes/${r1.R}/aprovar`, {}));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r1.R}/separacao`, { itens_separados: [{ item_id: r1.item, quantidade_separada: 3 }] }));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r1.R}/entregar`, { itens_atendidos: [{ item_id: r1.item, quantidade_atendida: 3 }] }));
    assert.deepStrictEqual(await livro(r1.R, m), [['SAIDA', 'L1', 3]]);
    const saida = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r1.R]);
    await ok(como('ADMIN').post(`${API}/devolucoes`, { material_id: m.id, quantidade: 1, motivo: 'DEFEITO', condicao: 'SUSPEITA',
      destino: 'QUARENTENA', movimentacao_saida_id: saida.id, localizacao_id: B01.id }), 201);
    const bpl = (await ok(como('ADMIN').get(`${API}/materiais/${m.id}/bloqueado-por-lote`))).body;
    assert.deepStrictEqual(bpl.lotes.map((l) => [l.codigo, l.quantidade]), [['L1', 1]]);
    const r2 = await criar(m, 2);
    const ap = await ok(como('ADMIN').put(`${API}/requisicoes/${r2.R}/aprovar`, {}));
    assert.strictEqual(ap.body.status, 'TOTALMENTE_RESERVADA');
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body.find((f) => Number(f.id) === Number(r2.R));
    assert.strictEqual(fila.itens[0].separavel, 2, JSON.stringify(fila.itens[0]));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r2.R}/separacao`, { itens_separados: [{ item_id: r2.item, quantidade_separada: 2 }] }));
    await ok(como('ALMOX').put(`${API}/requisicoes/${r2.R}/entregar`, { itens_atendidos: [{ item_id: r2.item, quantidade_atendida: 2 }] }));
    assert.deepStrictEqual(await livro(r2.R, m), [['SAIDA', 'L2', 2]], 'a peca da quarentena fica no L1');
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=1']);
  });
  await test('[RN-217.12 b, servico] a mesma montagem por registrarDevolucao, saldoDisponivelParaItem, lotesParaOAutomatico e entregarRequisicao', async () => {
    const m = await material();
    await entrar(m, 3, 'L1', B01.id); await entrar(m, 3, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    await quarentena(m, 1, 'L1', B01.id);
    assert.deepStrictEqual(await saldo(m), { disponivel: 5, lote_impedido: 0, disponivel_liberado: 5 });
    assert.deepStrictEqual(await autoCod(m), [['L1', 2], ['L2', 3]]);
    const { R, item } = await reqDireta(m, 4);
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 4 }], USERS.ALMOX);
    await requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 4 }], USERS.ALMOX, null);
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 2], ['SAIDA', 'L2', 2]], 'L1 da so as 2 livres');
    assert.deepStrictEqual(await linhas(m), ['L1=1', 'L2=1']);
  });

  // ── RN-217.13 (Fase 2 I1): lote com parte guardada — o retido sai do livre do LOTE, nao do livre usavel por endereco ───────────
  await test('[RN-217.13 a] L1 4 em B01 (R1 guardou 2 em B01/L1; 1 em quarentena em B01) e L2 5: o automatico de outra requisicao ve L1 1', async () => {
    const m = await material();
    await entrar(m, 4, 'L1', B01.id); await entrar(m, 5, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await reqDireta(m, 2);
    await requisitionService.separarRequisicao(db, r1.R, [{ item_id: r1.item, quantidade_separada: 2, localizacao_origem_id: B01.id,
      lote_id: await loteId(m, 'L1') }], USERS.ALMOX);
    await quarentena(m, 1, 'L1', B01.id);
    assert.deepStrictEqual(await linhas(m), ['L1=4', 'L2=5'], 'premissa');
    assert.deepStrictEqual(await autoCod(m), [['L1', 1], ['L2', 5]]);
  });
  await test('[RN-217.13 b] a peca da quarentena numa linha que o automatico ja nao usa (endereco bloqueado): o retido nao sai duas vezes — L1 1, nao 0', async () => {
    const m = await material();
    const B02 = await loc(`Z217-B02-${++seq}`);
    await entrar(m, 3, 'L1', B01.id); await entrar(m, 1, 'L1', B02.id); await entrar(m, 5, 'L2');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45));
    const r1 = await reqDireta(m, 2);
    await requisitionService.separarRequisicao(db, r1.R, [{ item_id: r1.item, quantidade_separada: 2, localizacao_origem_id: B01.id,
      lote_id: await loteId(m, 'L1') }], USERS.ALMOX);
    await quarentena(m, 1, 'L1', B02.id);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B02.id]);
    assert.deepStrictEqual(await autoCod(m), [['L1', 1], ['L2', 5]]);
  });

  // ── RN-217.14 (Fase 5, B1442): o envio da remessa espera a entrega (a trava do material) ──────────────────────────────────────
  // O gancho so sinaliza e segura a entrega DEPOIS da conferencia (dentro das duas travas); o envio e disparado do contexto do TESTE
  // (CLAUDE.md: disparado de dentro do gancho herdaria a secao e passaria direto pela trava).
  await test('[RN-217.14, Fase 5] remessa de L1 enviada no meio de uma entrega de 10 (L1 5, L2 5, L3 BLOQUEADO 4, uma remessa sem lote ja fora): o envio espera; a entrega sai L1 5 + L2 5, nenhuma linha sem lote negativa', async () => {
    const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');
    const m = await material();
    await entrar(m, 5, 'L1'); await entrar(m, 5, 'L2'); await entrar(m, 4, 'L3');
    await validade(m, 'L1', dia(5)); await validade(m, 'L2', dia(45)); await validade(m, 'L3', dia(90));
    await status(m, 'L3', 'BLOQUEADO');
    const r0 = await thirdPartyService.criarRemessa(db, ADMIN, { fornecedor_nome: 'F217', tipo_servico: 'G', itens: [{ material_id: m.id, quantidade: 2 }] });
    await thirdPartyService.enviarRemessa(db, ADMIN, r0.id);
    const r1 = await remessa(m, 'L1', 2, { enviar: false });
    const { R, item } = await reqDireta(m, 10);
    await requisitionService.separarRequisicao(db, R, [{ item_id: item, quantidade_separada: 10 }], USERS.ALMOX);
    let sinal; let soltar;
    const chegou = new Promise((res) => { sinal = res; });
    const orig = valueApprovalService.verificarBloqueioLiberacao;
    valueApprovalService.verificarBloqueioLiberacao = async (...a) => {
      sinal(); await new Promise((res) => { soltar = res; });
      return orig(...a);
    };
    let entregaP; let envioP;
    try {
      entregaP = requisitionService.entregarRequisicao(db, R, [{ item_id: item, quantidade_atendida: 10 }], USERS.ALMOX, null)
        .then(() => 'ok', (e) => `ERRO ${e.status} ${e.message}`);
      await chegou;
      valueApprovalService.verificarBloqueioLiberacao = orig;
      envioP = thirdPartyService.enviarRemessa(db, ADMIN, r1.remessaId).then(() => 'ok', (e) => `ERRO ${e.status} ${e.message}`);
      for (let i = 0; i < 200; i++) { // eslint-disable-line no-restricted-syntax
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setImmediate(r));
      }
      const x = await dbGet(db, 'SELECT enviado_em FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [r1.itemId]);
      assert.strictEqual(x.enviado_em, null, 'o claim do envio espera a trava do material (a entrega a segura)');
    } finally {
      valueApprovalService.verificarBloqueioLiberacao = orig;
      if (soltar) soltar();
    }
    assert.strictEqual(await entregaP, 'ok');
    assert.strictEqual(await envioP, 'ok');
    assert.deepStrictEqual(await livro(R, m), [['SAIDA', 'L1', 5], ['SAIDA', 'L2', 5]]);
    assert.deepStrictEqual(await linhas(m), ['L3=4'], 'nenhuma linha sem lote negativa');
  });

  // ── Fase 5 (revisor "o teste passaria com a feature quebrada?"): cada regra das familias e do limite com cenario proprio ──────────
  // Ate aqui tres regras so caiam pelo sorteio, cujo modelo reescreve a regra em JS. Montagem por SQL (linhas de saldo e livro).
  const rec5 = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-217-F5-${++seq}`])).lastID;
  const montarSql = async (lotes, { bloq = 0, inspMat = 0 } = {}) => {
    const m = await material();
    let total = 0;
    for (const l of lotes) { // eslint-disable-line no-restricted-syntax
      // eslint-disable-next-line no-await-in-loop
      const id = (await dbRun(db, 'INSERT INTO lotes_almoxarifado (material_id, codigo, status, data_validade) VALUES (?,?,?,?)',
        [m.id, l.codigo, l.status || 'ATIVO', l.venc])).lastID;
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,?,?)', [m.id, P01.id, id, l.saldo]);
      total += l.saldo;
      for (const [tipo, q] of l.livro || []) { // eslint-disable-line no-restricted-syntax
        // eslint-disable-next-line no-await-in-loop
        await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, lote_id)
          VALUES (?,?,?,0,0,?)`, [m.id, tipo, q, id]);
      }
      if (l.insp || l.repr) {
        // eslint-disable-next-line no-await-in-loop
        const it = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
          quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?,?,1,1,?,?)`, [rec5, m.id, id, l.insp || 0])).lastID;
        // eslint-disable-next-line no-await-in-loop
        if (l.repr) await dbRun(db, 'INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, quantidade_reprovada) VALUES (?, ?)', [it, l.repr]);
      }
    }
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, quantidade_bloqueada = ?, quantidade_em_inspecao = ? WHERE id = ?',
      [total, bloq, inspMat, m.id]);
    return m;
  };
  await test('[RN-217.06 b, Fase 5] ordem das familias: quarentena 2 no L1 + reprovacao 2 no L2 com bloqueada 3 -> a reprovacao cai (L2 inteiro), a quarentena fica (L1 3)', async () => {
    const m = await montarSql([{ codigo: 'L1', venc: dia(5), saldo: 5, livro: [['BLOQUEIO', 2]] }, { codigo: 'L2', venc: dia(45), saldo: 5, repr: 2 }], { bloq: 3 });
    assert.deepStrictEqual(await autoCod(m), [['L1', 3], ['L2', 5]]);
  });
  await test('[RN-217.05 b, Fase 5] o limite por lote e o fisico LIVRE (saldo - inspecao): L1 3 com 2 em inspecao e 2 em quarentena, L2 BLOQUEADO 4 -> retem 1, impedido 3', async () => {
    const m = await montarSql([{ codigo: 'L1', venc: dia(5), saldo: 3, insp: 2, livro: [['BLOQUEIO', 2]] },
      { codigo: 'L2', venc: dia(45), saldo: 4, status: 'BLOQUEADO' }], { bloq: 2, inspMat: 2 });
    assert.strictEqual(await impSql(m), 3, 'resto 1 (as 2 - o 1 que cabe no L1) volta para o material');
    assert.deepStrictEqual(await autoCod(m), []);
  });
  await test('[B1434, Fase 5] lote com livro negativo nao "devolve" peca: L1 com DESBLOQUEIO 2 sem bloqueio, L2 com BLOQUEIO 2 (bloqueada 2) e L3 BLOQUEADO 4 -> L1 5, L2 3, impedido 4', async () => {
    const m = await montarSql([{ codigo: 'L1', venc: dia(5), saldo: 5, livro: [['DESBLOQUEIO', 2]] },
      { codigo: 'L2', venc: dia(45), saldo: 5, livro: [['BLOQUEIO', 2]] }, { codigo: 'L3', venc: dia(90), saldo: 4, status: 'BLOQUEADO' }], { bloq: 2 });
    assert.deepStrictEqual(await autoCod(m), [['L1', 5], ['L2', 3]]);
    assert.strictEqual(await impSql(m), 4, 'o -2 do L1 nao abate o retido do L2 (o resto do material e 0)');
  });
  await test('[B1436, Fase 5] fracoes: quarentena 0,1 no L1 e 0,2 no L2 com bloqueada 0,3 (a soma da 0.30000000000000004) -> a familia cabe pela folga', async () => {
    const m = await montarSql([{ codigo: 'L1', venc: dia(5), saldo: 1, livro: [['BLOQUEIO', 0.1]] },
      { codigo: 'L2', venc: dia(45), saldo: 1, livro: [['BLOQUEIO', 0.2]] }], { bloq: 0.3 });
    assert.deepStrictEqual(await autoCod(m), [['L1', 0.9], ['L2', 0.8]]);
  });
  await test('[RN-217.11 b, Fase 5] o detalhe nao promete a peca da quarentena: L1 2 todo em quarentena, L2 BLOQUEADO 3, item separado 1 -> lote_impedido 3, entregavel 0 (pela conta da 205 com o retido; o teto pelo automatico da o mesmo numero por construcao)', async () => {
    const m = await material();
    await entrar(m, 2, 'L1'); await quarentena(m, 2, 'L1');
    await entrar(m, 3, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const { R, item } = await reqDireta(m, 1);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'EM_SEPARACAO' WHERE id = ?", [R]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = 1 WHERE id = ?', [item]);
    const det = (await ok(como('ADMIN').get(`${API}/requisicoes/${R}`))).body.itens[0];
    assert.strictEqual(det.lote_impedido, 3, JSON.stringify(det));
    assert.strictEqual(det.quantidade_entregavel, 0, JSON.stringify(det));
  });

  // ── RN-217.09: uma regua so (sorteio) ─────────────────────────────────────────────────────────────────────────────────────────
  // Materiais montados por SQL (linhas de saldo, livro, inspecoes, remessas) contra um MODELO em JS das B1434-B1438. Inteiros.
  await test('[RN-217.09, sorteio] 120 materiais: loteImpedidoSql e lotesParaOAutomatico iguais ao modelo; com as familias cabendo, o impedido nunca abaixo do de hoje', async () => {
    let semente = 217;
    const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const STS = ['ATIVO', 'ATIVO', 'BLOQUEADO', 'REPROVADO'];
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero) VALUES (?)', [`REC-217-S-${++seq}`])).lastID;
    const rem = (await dbRun(db, "INSERT INTO remessas_terceiro_almoxarifado (numero, status) VALUES (?, 'ENVIADA')", [`REM-217-S-${++seq}`])).lastID;
    let comRetido = 0; let familiaCaiu = 0; let subiu = 0;
    for (let k = 0; k < 120; k++) { // eslint-disable-line no-restricted-syntax
      const m = await material(); // eslint-disable-line no-await-in-loop
      const lotes = [];
      const n = int(1, 4);
      for (let j = 0; j < n; j++) {
        const st = STS[int(0, 3)];
        const venc = rnd() < 0.2 ? dia(-2) : dia(int(3, 90));
        const lib = rnd() < 0.3 ? '2026-01-01' : null;
        // eslint-disable-next-line no-await-in-loop
        const id = (await dbRun(db, 'INSERT INTO lotes_almoxarifado (material_id, codigo, status, data_validade, vencimento_liberado_em) VALUES (?,?,?,?,?)',
          [m.id, `S${j}`, st, venc, lib])).lastID;
        const saldoL = int(-1, 8);
        // eslint-disable-next-line no-await-in-loop
        await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id, quantidade) VALUES (?,?,?,?)', [m.id, P01.id, id, saldoL]);
        const insp = rnd() < 0.2 ? int(0, 3) : 0;
        if (insp) { // eslint-disable-next-line no-await-in-loop
          await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida,
            lote_id, quantidade_em_inspecao) VALUES (?,?,?,?,?,?)`, [rec, m.id, insp, insp, id, insp]);
        }
        let quar = 0;
        const nq = rnd() < 0.5 ? int(1, 2) : 0;
        for (let x = 0; x < nq; x++) {
          const tipo = rnd() < 0.75 ? 'BLOQUEIO' : 'DESBLOQUEIO';
          const q = int(1, 3); const canc = rnd() < 0.15 ? 1 : 0;
          // eslint-disable-next-line no-await-in-loop
          await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, lote_id, cancelado)
            VALUES (?,?,?,0,0,?,?)`, [m.id, tipo, q, id, canc]);
          if (!canc) quar += tipo === 'BLOQUEIO' ? q : -q;
        }
        let repr = 0;
        if (rnd() < 0.35) {
          const q = int(1, 3);
          // eslint-disable-next-line no-await-in-loop
          const it = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
            quantidade_recebida, lote_id, quantidade_em_inspecao) VALUES (?,?,?,?,?,0)`, [rec, m.id, q, q, id])).lastID;
          const carimbo = rnd() < 0.3 ? ['liberacao_nc_em', 'devolucao_fornecedor_em', 'sucateamento_em'][int(0, 2)] : null;
          // eslint-disable-next-line no-await-in-loop
          await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, quantidade_aprovada, quantidade_reprovada${carimbo ? `, ${carimbo}` : ''})
            VALUES (?, 0, ?${carimbo ? ', CURRENT_TIMESTAMP' : ''})`, [it, q]);
          if (!carimbo) repr += q;
        }
        let terc = 0;
        if (rnd() < 0.35) {
          const q = int(1, 4); const ret = int(0, q); const env = rnd() < 0.8;
          // eslint-disable-next-line no-await-in-loop
          await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade, quantidade_retornada, lote_id, enviado_em)
            VALUES (?,?,?,?,?,?)`, [rem, m.id, q, ret, id, env ? '2026-11-01 10:00:00' : null]);
          if (env) terc += q - ret;
        }
        const vencido = venc < diaLocal.hojeLocalISO();
        lotes.push({ id, saldo: saldoL, insp, quar, repr, terc, impedido: st !== 'ATIVO' || (vencido && !lib) });
      }
      const fis = (l) => Math.max(0, l.saldo - l.insp);
      const sq = lotes.reduce((a, l) => a + Math.max(0, l.quar), 0); const sr = lotes.reduce((a, l) => a + l.repr, 0);
      const st3 = lotes.reduce((a, l) => a + l.terc, 0);
      const semLoteBloq = rnd() < 0.3 ? int(0, 2) : 0;
      const bloq = rnd() < 0.2 ? Math.max(0, sq + sr - int(1, 3)) : Math.max(0, sq + sr) + semLoteBloq;
      const tercMat = rnd() < 0.2 ? Math.max(0, st3 - 1) : st3 + (rnd() < 0.3 ? 1 : 0);
      const inspSemRec = rnd() < 0.15 ? int(0, 2) : 0;
      const inspLotes = lotes.reduce((a, l) => a + l.insp, 0);
      const total = lotes.reduce((a, l) => a + l.saldo, 0);
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ?, quantidade_bloqueada = ?, quantidade_em_terceiros = ?,
        quantidade_em_inspecao = ? WHERE id = ?`, [total, bloq, tercMat, inspLotes + inspSemRec, m.id]);
      const quarOk = sq <= bloq; const reprOk = sq + sr <= bloq; const tercOk = st3 <= tercMat;
      if (!quarOk || !reprOk || !tercOk) familiaCaiu++;
      const ret = (l) => Math.min((quarOk ? Math.max(0, l.quar) : 0) + (reprOk ? l.repr : 0) + (tercOk ? l.terc : 0), fis(l));
      const atribuido = lotes.reduce((a, l) => a + ret(l), 0);
      if (atribuido > 0) comRetido++;
      const soma = lotes.filter((l) => l.impedido).reduce((a, l) => a + Math.max(0, fis(l) - ret(l)), 0);
      const resto = Math.max(0, bloq + tercMat - atribuido);
      const modelo = Math.max(0, soma - resto - inspSemRec);
      const hoje = Math.max(0, lotes.filter((l) => l.impedido).reduce((a, l) => a + fis(l), 0) - bloq - tercMat - inspSemRec);
      const ctx = JSON.stringify({ lotes, bloq, tercMat, inspSemRec, modelo, hoje });
      const sql = await impSql(m); // eslint-disable-line no-await-in-loop
      assert.strictEqual(sql, modelo, `loteImpedidoSql ${ctx}`);
      if (quarOk && reprOk && tercOk) assert.ok(sql >= hoje, `abaixo de hoje com as familias cabendo ${ctx}`);
      if (sql > hoje) subiu++;
      const autoModelo = lotes.filter((l) => !l.impedido && l.saldo > 0).map((l) => [l.id, l.saldo - l.insp - ret(l)])
        .filter(([, q]) => q > 1e-9).sort((a, b) => a[0] - b[0]);
      const autoSql = (await auto(m)).sort((a, b) => a[0] - b[0]); // eslint-disable-line no-await-in-loop
      assert.deepStrictEqual(autoSql, autoModelo, `lotesParaOAutomatico ${ctx}`);
    }
    assert.ok(comRetido >= 30, `premissa: retido por lote em ${comRetido} materiais`);
    assert.ok(familiaCaiu >= 10, `premissa: familia fora do total em ${familiaCaiu} materiais`);
    assert.ok(subiu >= 5, `premissa: o impedido subiu (a peca bloqueada num lote bom) em ${subiu} materiais`);
  });

  console.log(`\n${passed} passou, ${failed} falhou\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
