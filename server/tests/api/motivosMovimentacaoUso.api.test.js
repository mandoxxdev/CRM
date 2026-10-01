/**
 * Etapa 66, Task 2 (tronco) — a movimentacao cita o motivo do CADASTRO (`motivo_id`).
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa66-motivos-de-movimentacao.md
 * (vale a secao "Fase 2 — revisao do plano": `motivo_id` mal formado tem a MESMA mensagem nas
 * duas portas, o helper reatribui `params` antes da desestruturacao do motor, e tipo invalido
 * continua respondendo primeiro com a mensagem de hoje).
 *
 * Prova RN-05 (livro grava nome do momento + id; complemento; satisfaz "exige justificativa"),
 * RN-06 (as recusas literais, com livro e saldo INTACTOS) e RN-07 (o texto livre de hoje passa
 * identico; v1 nao carrega `motivo_id`).
 *
 * TRES PORTAS, por exigencia da skill (fiacao): a rota v2 (prova o `MovimentacaoSchema`, que
 * descarta chave nao declarada — foi assim que `reserva_id` morreu na Etapa 4), a
 * `/transferencias` (body cru, sem validate) e o servico direto (`registrarMovimentacao`).
 *
 * Executar: cd server && node tests/api/motivosMovimentacaoUso.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 66, nome: 'Admin Etapa66', role: 'admin', is_superadmin: 1, email: 'e66@test.com' };
const ALMOXARIFE = { id: 668, nome: 'Almoxarife E66', perfil_almoxarifado: 'ALMOXARIFE' };

const FORMATO = 'motivo_id deve ser um número inteiro positivo';
const OS_DOIS = 'Informe o motivo do cadastro (motivo_id) ou o motivo digitado (motivo), não os dois';
const NAO_ENCONTRADO = 'Motivo de movimentação não encontrado';
const desativado = (nome) => `O motivo "${nome}" está desativado`;
const naoServe = (nome, tipo) => `O motivo "${nome}" não serve para movimentação do tipo ${tipo}`;

let seq = 0;
const uniq = (p) => `${p} ${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 66 Task 2: motivo do cadastro na movimentacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  const loc = async () => {
    const c = `E66-L${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID, codigo: c };
  };
  // Material com localizacao padrao e 50 de saldo entrado PELO MOTOR (a linha de saldo existe).
  const material = async () => {
    const P = await loc();
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id) VALUES (?, 'Mat E66', 'UN', 0, 1, 'ACO', ?)`,
    [`E66-M${++seq}`, P.id])).lastID;
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: id, tipo: 'ENTRADA', quantidade: 50, localizacao_destino_id: P.id, motivo: 'setup' });
    assert.strictEqual(r.status, 201, `setup ENTRADA: ${JSON.stringify(r.body)}`);
    return { id, P };
  };
  const criarMotivo = async (nome, tipos) => {
    setUser({ ...ADMIN });
    const r = await request(app).post('/api/almoxarifado/motivos-movimentacao').send({ nome, tipos });
    assert.strictEqual(r.status, 201, `setup motivo: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const v2 = (body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send(body);
  const ultimo = (m) => dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m]);
  const estado = async (m) => ({
    n: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n,
    saldo: (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q,
  });
  const recusa = (r, literal) => {
    assert.strictEqual(r.status, 400, `esperava 400 "${literal}", veio ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, literal);
  };

  const avaria = await criarMotivo(uniq('Avaria no manuseio'), ['AJUSTE', 'PERDA']);
  const soPerda = await criarMotivo(uniq('Quebra'), ['PERDA']);
  const doTransf = await criarMotivo(uniq('Reorganizacao'), ['TRANSFERENCIA']);
  const deSaida = await criarMotivo(uniq('Consumo interno'), ['SAIDA', 'SAIDA_PRODUCAO']);
  const inativo = await criarMotivo(uniq('Antigo'), ['AJUSTE', 'PERDA']);
  await request(app).delete(`/api/almoxarifado/motivos-movimentacao/${inativo.id}`);

  // ── RN-05 pela v2 ──────────────────────────────────────────────────────────────────────────
  await test('(1) RN-05 v2: AJUSTE com motivo_id e sem texto → 201; livro motivo=nome, justificativa=nome, motivo_id=id', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 40, motivo_id: avaria.id });
    assert.strictEqual(r.status, 201,
      `${r.status} ${JSON.stringify(r.body)} — se veio "AJUSTE exige justificativa", o motivo do cadastro nao preencheu a `
      + 'justificativa; se o motivo_id nao chegou, o MovimentacaoSchema o descartou');
    const l = await ultimo(m);
    assert.strictEqual(l.motivo_id, avaria.id, `motivo_id no livro: ${l.motivo_id} — a v2 descartou a chave?`);
    assert.strictEqual(l.motivo, avaria.nome);
    assert.strictEqual(l.justificativa, avaria.nome);
    assert.strictEqual((await estado(m)).saldo, 40);
  });

  await test('(2) RN-05 complemento: PERDA com motivo_id + "  caixa amassada " → "Nome — caixa amassada"; so espacos nao grava "Nome — "', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    const r = await v2({ material_id: m, tipo: 'PERDA', quantidade: 2, motivo_id: avaria.id, justificativa: '  caixa amassada ' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    let l = await ultimo(m);
    assert.strictEqual(l.justificativa, `${avaria.nome} — caixa amassada`);
    assert.strictEqual(l.motivo, avaria.nome);
    const r2 = await v2({ material_id: m, tipo: 'PERDA', quantidade: 1, motivo_id: avaria.id, justificativa: '   ' });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    l = await ultimo(m);
    assert.strictEqual(l.justificativa, avaria.nome, `complemento vazio gravou ${JSON.stringify(l.justificativa)}`);
    assert.strictEqual((await estado(m)).saldo, 47);
  });

  await test('(3) RN-05 satisfaz a regra "qualquer" da SAIDA e a "emergencial exige justificativa"', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    // Controle: sem motivo_id e sem nada, a mesma SAIDA e recusada — prova que o 201 abaixo veio do motivo.
    recusa(await v2({ material_id: m, tipo: 'SAIDA', quantidade: 1 }), 'Saída exige OS, projeto, centro de custo ou justificativa');
    const r = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 1, motivo_id: deSaida.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    recusa(await v2({ material_id: m, tipo: 'SAIDA_PRODUCAO', quantidade: 1, emergencial: true }), 'Movimentação emergencial exige justificativa');
    const e = await v2({ material_id: m, tipo: 'SAIDA_PRODUCAO', quantidade: 1, emergencial: true, motivo_id: deSaida.id });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    assert.strictEqual((await ultimo(m)).regularizacao_pendente, 1);
  });

  // ── RN-06 pela v2 ──────────────────────────────────────────────────────────────────────────
  await test('(4) RN-06 v2: as quatro recusas na ordem do contrato, cada uma literal, livro e saldo intactos', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    const antes = await estado(m);
    const base = { material_id: m, tipo: 'AJUSTE', quantidade: 10 };
    recusa(await v2({ ...base, motivo_id: avaria.id, motivo: 'texto tambem' }), OS_DOIS);
    recusa(await v2({ ...base, motivo_id: 999777 }), NAO_ENCONTRADO);
    recusa(await v2({ ...base, motivo_id: inativo.id }), desativado(inativo.nome));
    recusa(await v2({ ...base, motivo_id: soPerda.id }), naoServe(soPerda.nome, 'AJUSTE'));
    // Ordem: os dois juntos com motivo inexistente → a de "os dois" vem antes.
    recusa(await v2({ ...base, motivo_id: 999777, motivo: 'x' }), OS_DOIS);
    // Ordem: inativo E que nao serve → inativo antes.
    const inativoSoPerda = await criarMotivo(uniq('Inativo so perda'), ['PERDA']);
    await request(app).delete(`/api/almoxarifado/motivos-movimentacao/${inativoSoPerda.id}`);
    setUser({ ...ALMOXARIFE });
    recusa(await v2({ ...base, motivo_id: inativoSoPerda.id }), desativado(inativoSoPerda.nome));
    assert.deepStrictEqual(await estado(m), antes, 'uma recusa mexeu no livro ou no saldo');
  });

  await test('(5) RN-06 v2: motivo_id mal formado (0, "7", 1.5, "abc", true, -3) → mensagem literal unica; null = sem motivo', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    const antes = await estado(m);
    for (const mal of [0, String(avaria.id), 1.5, 'abc', true, -3, {}]) {
      recusa(await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, motivo_id: mal, justificativa: 'x' }), FORMATO);
    }
    assert.deepStrictEqual(await estado(m), antes, 'um motivo_id mal formado mexeu no livro ou no saldo');
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 10, motivo_id: null, motivo: 'livre', justificativa: 'livre' });
    assert.strictEqual(r.status, 201, `motivo_id null tinha de valer como ausente: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await ultimo(m)).motivo_id, null);
  });

  await test('(6) ordem: tipo invalido responde PRIMEIRO com a mensagem de hoje, mesmo com motivo_id ruim', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    const r = await v2({ material_id: m, tipo: 'ESTORNO', quantidade: 1, motivo_id: 'abc' });
    assert.strictEqual(r.status, 400);
    assert.ok(!/motivo/i.test(r.body.error), `a recusa do tipo perdeu para a do motivo: ${JSON.stringify(r.body)}`);
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'XYZ', quantidade: 1, motivo_id: 999777 }),
      (e) => e.status === 400 && e.message === 'Tipo de movimento inválido',
    );
  });

  // ── RN-07: o texto livre continua ──────────────────────────────────────────────────────────
  await test('(7) RN-07: payload de hoje da tela passa identico; AJUSTE sem nada recusa como hoje', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    const r = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 30, motivo: avaria.nome, justificativa: avaria.nome });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const l = await ultimo(m);
    assert.strictEqual(l.motivo, avaria.nome);
    assert.strictEqual(l.justificativa, avaria.nome);
    assert.strictEqual(l.motivo_id, null, 'texto livre igual ao nome do cadastro NAO pode virar motivo_id');
    recusa(await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 30 }), 'AJUSTE exige justificativa');
    // Motivo so com espacos + motivo_id: espacos = vazio, entao nao e "os dois".
    const s = await v2({ material_id: m, tipo: 'AJUSTE', quantidade: 31, motivo: '   ', motivo_id: avaria.id });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    assert.strictEqual((await ultimo(m)).motivo, avaria.nome);
  });

  await test('(8) RN-07 v1: motivo_id no body NAO chega ao motor (params montados a mao) → livro com motivo_id NULL', async () => {
    setUser({ ...ADMIN });
    const { id: m } = await material();
    const r = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: m, tipo: 'AJUSTE', quantidade: 20, motivo: 'texto v1', motivo_id: avaria.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const l = await ultimo(m);
    assert.strictEqual(l.motivo, 'texto v1');
    assert.strictEqual(l.motivo_id, null);
    const sem = await request(app).post('/api/almoxarifado/movimentacoes').send({ material_id: m, tipo: 'AJUSTE', quantidade: 20 });
    recusa(sem, 'Motivo é obrigatório para saída e ajuste');
  });

  // ── /transferencias (body cru) ─────────────────────────────────────────────────────────────
  await test('(9) /transferencias: motivo_id grava; mal formado, "os dois" e "nao serve" com as MESMAS literais da v2', async () => {
    setUser({ ...ALMOXARIFE });
    const { id: m, P } = await material();
    const B = await loc();
    const transf = (extra) => request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: m, quantidade: 4, localizacao_origem_id: P.id, localizacao_destino_id: B.id, ...extra });
    const antes = await estado(m);
    recusa(await transf({ motivo_id: String(doTransf.id) }), FORMATO);
    recusa(await transf({ motivo_id: 0 }), FORMATO);
    recusa(await transf({ motivo_id: doTransf.id, motivo: 'x' }), OS_DOIS);
    recusa(await transf({ motivo_id: avaria.id }), naoServe(avaria.nome, 'TRANSFERENCIA'));
    recusa(await transf({ motivo_id: inativo.id }), desativado(inativo.nome));
    assert.deepStrictEqual(await estado(m), antes, 'uma recusa da /transferencias mexeu no livro');
    const r = await transf({ motivo_id: doTransf.id, justificativa: 'corredor 3' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const l = await ultimo(m);
    assert.strictEqual(l.tipo, 'TRANSFERENCIA');
    assert.strictEqual(l.motivo_id, doTransf.id);
    assert.strictEqual(l.motivo, doTransf.nome);
    assert.strictEqual(l.justificativa, `${doTransf.nome} — corredor 3`);
  });

  // ── Servico direto ─────────────────────────────────────────────────────────────────────────
  await test('(10) servico direto: registrarMovimentacao resolve o motivo_id e recusa com .status 400 sem mexer no saldo', async () => {
    const { id: m } = await material();
    const antes = await estado(m);
    const chamar = (extra) => stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'PERDA', quantidade: 3, ...extra });
    for (const [extra, msg] of [
      [{ motivo_id: '1' }, FORMATO],
      [{ motivo_id: avaria.id, motivo: 'x' }, OS_DOIS],
      [{ motivo_id: 999777 }, NAO_ENCONTRADO],
      [{ motivo_id: inativo.id }, desativado(inativo.nome)],
      [{ motivo_id: deSaida.id }, naoServe(deSaida.nome, 'PERDA')],
    ]) {
      await assert.rejects(() => chamar(extra), (e) => {
        assert.strictEqual(e.status, 400, `${JSON.stringify(extra)}: status ${e.status} (${e.message})`);
        assert.strictEqual(e.message, msg);
        return true;
      });
    }
    assert.deepStrictEqual(await estado(m), antes);
    await chamar({ motivo_id: soPerda.id, justificativa: 'no transporte' });
    const l = await ultimo(m);
    assert.strictEqual(l.motivo_id, soPerda.id);
    assert.strictEqual(l.motivo, soPerda.nome);
    assert.strictEqual(l.justificativa, `${soPerda.nome} — no transporte`);
    assert.strictEqual((await estado(m)).saldo, 47);
  });

  // ── D2: o livro guarda o texto do momento ──────────────────────────────────────────────────
  await test('(11) D2: renomear o motivo e trocar seus tipos depois NAO reescreve a linha ja gravada', async () => {
    const nome = uniq('Sera renomeado');
    const mot = await criarMotivo(nome, ['PERDA']);
    setUser({ ...ALMOXARIFE });
    const { id: m } = await material();
    assert.strictEqual((await v2({ material_id: m, tipo: 'PERDA', quantidade: 1, motivo_id: mot.id })).status, 201);
    const linha = await ultimo(m);
    setUser({ ...ADMIN });
    const put = await request(app).put(`/api/almoxarifado/motivos-movimentacao/${mot.id}`).send({ nome: `${nome} v2`, tipos: ['AJUSTE'] });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    const depois = await dbGet(db, 'SELECT motivo, justificativa, motivo_id FROM movimentacoes_almoxarifado WHERE id = ?', [linha.id]);
    assert.deepStrictEqual(depois, { motivo: nome, justificativa: nome, motivo_id: mot.id });
    // E o livro pela rota devolve motivo_id (m.*), sem mudanca de rota.
    const livro = await request(app).get('/api/almoxarifado/movimentacoes').query({ material_id: m });
    const lida = (livro.body.movimentacoes || livro.body).find((x) => x.id === linha.id);
    assert.ok(lida, `a linha ${linha.id} nao veio no GET /movimentacoes`);
    assert.strictEqual(lida.motivo_id, mot.id);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
