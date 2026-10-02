/**
 * Etapa 75 (Fase 5, revisao adversarial) — os tres achados corrigidos, nos DOIS avisos (chegada da 74 e
 * liberacao da 75) e no miolo compartilhado (`reservaChegadaService.distribuirParaQuemEspera`).
 *
 * 1. A REGUA do aviso: os dois e-mails calculavam `pendente = (solicitada - separada) - hold alheio`, mas o
 *    hold que sobra numa PARCIALMENTE_ATENDIDA cobre justamente o separado na caixa — descontava duas vezes:
 *    o e-mail dizia "pendente 2; reservado 2" quando o miolo tinha reservado 4 (e o certo e 4/4). Agora a
 *    regua e a do miolo: pendente de ENTREGA - hold que nao e deste documento.
 * 2. A CORRIDA: duas inspecoes simultaneas do mesmo material (ou duas notas da 74) reservavam, cada uma via o
 *    hold acima do pendente e as duas desfaziam TUDO — a fila inteira ficava sem nada (8/8 rodadas na sonda).
 *    Agora o miolo e serializado POR MATERIAL (fila de promises em processo).
 * 3. O DONO: a requisicao pulada pela regra do dono (material de cliente sem o projeto do dono — a entrega
 *    recusaria) recebia o e-mail L0 "Material liberado para a sua requisicao". Agora o aviso filtra pela mesma
 *    regra do miolo.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md (Fase 5)
 *
 * Executar: cd server && node tests/api/reservaLiberacaoRevisaoFase5.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Fat 75F', role: 'admin', is_superadmin: 1, email: 'f75f@t.com' };
const SOL = { id: 7601, nome: 'Sol 75F', role: 'admin', is_superadmin: 1, email: 's75f@t.com' };
const QUALIDADE = { id: 7603, nome: 'Insp 75F', perfil_almoxarifado: 'QUALIDADE', email: 'q75f@t.com' };
const API = '/api/almoxarifado';
const EVENTO = 'RECEBIMENTO_ENTRADA_REQUISITANTE';
const hash = (chave) => crypto.createHash('sha256').update(`${EVENTO}|${chave}`).digest('hex');
let seq = 0;

(async () => {
  console.log('\n=== Etapa 75 (Fase 5): regua do aviso, corrida por material e regra do dono ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F75F','76000000000176','ativo')")).lastID;
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico', '1')
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (7601, 'Sol 75F', 's75f@t.com', 1)");
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const semWarn = async (fn) => {
    const orig = console.warn; console.warn = () => {};
    try { return await fn(); } finally { console.warn = orig; }
  };

  const material = async ({ critico = 1, cliente = null } = {}) => {
    const c = `E75F-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico, proprietario_cliente_id)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, ?, ?)`, [c, `Mat ${c}`, forn, critico, cliente])).lastID;
  };
  const codigo = async (m) => (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [m])).codigo;
  const entradaManual = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 75F' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const reqDireta = async (status, itens, extra = {}) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor, projeto_id)
      VALUES (?, ?, 'Sol 75F', ?, 'NORMAL', ?, 1, '2026-09-01 10:00:00', ?)`,
    [`REQ-E75F-${++seq}`, SOL.id, status, extra.criado || '2026-09-01 10:00:00', extra.projeto_id || null])).lastID;
    for (const [m, q, sep = 0, ent = 0] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,?,?,?)`, [id, m, q, sep, ent, ent]);
    }
    return id;
  };
  const notaSemProcessar = async (linhas) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F75F', '2026-09-01', '2026-09-02', 10)`, [`REC-E75F-${++seq}`, `NF-E75F-${seq}`])).lastID;
    for (const [m, q] of linhas) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m, q, q]);
    }
    return r;
  };
  const processar = (rec) => request(app).post(`${API}/recebimentos/${rec}/processar`).send({});
  const nota = async (linhas) => {
    const r = await notaSemProcessar(linhas);
    const p = await processar(r);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    return r;
  };
  const itemDaNota = async (rec) => (await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [rec])).id;
  const inspecionar = (itemId, a, r) => as(QUALIDADE, () => request(app).post(`${API}/recebimentos/itens/${itemId}/inspecionar`)
    .send({ quantidade_aprovada: a, quantidade_reprovada: r, encaminhamento: r > 0 ? 'DEVOLVER' : undefined }));
  const hold = async (rid) => (await dbAll(db, `SELECT quantidade, quantidade_utilizada FROM reservas_material_almoxarifado
      WHERE requisicao_id = ? AND status = 'ATIVA'`, [rid]))
    .reduce((s, x) => s + Number(x.quantidade) - Number(x.quantidade_utilizada || 0), 0);
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const avisos = (rid) => dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ?
    AND json_extract(payload, '$.requisicao_id') = ? ORDER BY id`, [EVENTO, rid]);
  const itemDe = async (reqId, m) => (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id = ?', [reqId, m])).id;
  // O hold que sobrou da reserva da aprovacao (sem recebimento_id): cobre o separado na caixa.
  const reservarDaAprovacao = async (m, q, rid) => stockService.criarReserva(db, ADMIN,
    { material_id: m, quantidade: q, observacoes: 'setup 75F' },
    { sistema: true, requisicao_id: rid, item_requisicao_id: await itemDe(rid, m) });

  // ══════════════ 1. A regua do aviso (separado != entregue) ══════════════

  await test('[regua 75] PARCIALMENTE_ATENDIDA com separado na caixa: o e-mail da inspecao diz pendente 4; reservado 4 (nao 2/2)', async () => {
    const m = await material();
    await entradaManual(m, 2); // o fisico do separado na caixa (coberto pelo hold da aprovacao)
    const R = await reqDireta('PARCIALMENTE_ATENDIDA', [[m, 10, 6, 4]]);
    await reservarDaAprovacao(m, 2, R);
    const rec = await nota([[m, 4]]);
    const ins = await inspecionar(await itemDaNota(rec), 4, 0);
    assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
    assert.strictEqual(await hold(R), 6, 'o miolo reserva a falta de entrega: 6 - 2 = 4 (hold 2 + 4)');
    const av = await avisos(R);
    assert.strictEqual(av.length, 1, 'um e-mail da liberacao');
    const insp = await dbGet(db, 'SELECT id FROM inspecoes_recebimento_almoxarifado WHERE recebimento_item_id = ?', [await itemDaNota(rec)]);
    assert.strictEqual(av[0].hash_dedupe, hash(`inspecao-liberada-${insp.id}-req-${R}`));
    const cod = await codigo(m);
    assert.ok(av[0].corpo_texto.includes(`- ${cod} — Mat ${cod}: liberado 4 PC (pendente na requisição: 4 PC; reservado para a sua requisição: 4 PC)`),
      `linha do material: ${av[0].corpo_texto.split('\n')[5]}`);
  });

  await test('[regua 74] PARCIALMENTE_ATENDIDA com separado na caixa: o e-mail da chegada diz pendente 4; reservado 4 (nao 2/2)', async () => {
    const m = await material({ critico: 0 });
    await entradaManual(m, 2);
    const R = await reqDireta('PARCIALMENTE_ATENDIDA', [[m, 10, 6, 4]]);
    await reservarDaAprovacao(m, 2, R);
    await nota([[m, 4]]);
    assert.strictEqual(await hold(R), 6, 'o miolo reserva a falta de entrega na chegada: 4');
    const av = await avisos(R);
    assert.strictEqual(av.length, 1, 'um e-mail da chegada');
    const cod = await codigo(m);
    assert.ok(av[0].corpo_texto.includes(`- ${cod} — Mat ${cod}: entrou 4 PC (pendente na requisição: 4 PC; reservado para a sua requisição: 4 PC)`),
      `linha do material: ${av[0].corpo_texto.split('\n')[5]}`);
  });

  await test('[regua = miolo] separado na caixa SEM hold (separou do livre): o miolo segura a caixa no hold (6) e o e-mail diz 6/6 (a regua antiga dizia 4/4)', async () => {
    // O separado continua no saldo; quem o protege de ser prometido a outro e o hold — por isso o miolo
    // reserva o pendente de ENTREGA inteiro (o RN-06 da 74 prende isto). O e-mail tem de dizer o mesmo.
    const m = await material();
    await entradaManual(m, 2); // o fisico do separado na caixa, separado do LIVRE (sem reserva)
    const R = await reqDireta('PARCIALMENTE_ATENDIDA', [[m, 10, 6, 4]]);
    const rec = await nota([[m, 6]]);
    const ins = await inspecionar(await itemDaNota(rec), 6, 0);
    assert.strictEqual(ins.status, 201, JSON.stringify(ins.body));
    assert.strictEqual(await hold(R), 6, 'o miolo: pendente de entrega 6 - hold 0');
    const cod = await codigo(m);
    const [aR] = await avisos(R);
    assert.ok(aR.corpo_texto.includes(`- ${cod} — Mat ${cod}: liberado 6 PC (pendente na requisição: 6 PC; reservado para a sua requisição: 6 PC)`), aR.corpo_texto.split('\n')[5]);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
