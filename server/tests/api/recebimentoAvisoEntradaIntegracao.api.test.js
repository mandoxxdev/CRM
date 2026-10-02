/**
 * Etapa 70, T4 (integracao, cruza o tronco T0-T2 e o modulo CORE Compras) — o aviso da nota que
 * entrou no estoque e o aviso a quem pediu, ponta a ponta, TUDO PELAS ROTAS.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa70-email-entrada-confirmada.md (T4 e a
 * secao "Fase 2 — revisao do plano", que PREVALECE: o criterio por ITEM e nao por status AGUARDANDO_*,
 * o link pelo basePath do modulo de origem, a chave do aviso da nota nascendo '0', o "chegou zero").
 *
 * T0 (zero nao entra), T0b (claim), T1 (servico) e T2 (ganchos) foram provados cada um no seu arquivo,
 * com recebimento e requisicao montados por INSERT. Aqui se prova que conversam numa operacao real:
 *
 *  - a solicitacao de compra nasce pela rota de reposicao (`verificar-minimos`);
 *  - R1 nasce pela rota de OUTRO MODULO (`POST /api/requisicoes-material`, modulo_origem comercial),
 *    pedida por quem NAO aprova; R2 e R3 pela rota do almoxarifado (modulo_origem almoxarifado);
 *  - o ADMIN aprova as tres: R1 -> AGUARDANDO_COMPRA; R2 (um item com saldo, outro sem) ->
 *    PARCIALMENTE_RESERVADA; R3 (so o material que vai chegar ZERO e o critico) -> AGUARDANDO_ESTOQUE;
 *  - o pedido nasce pela rota de COMPRAS, vinculado a solicitacao;
 *  - o recebimento contra o pedido (payload da tela) -> iniciar_conferencia -> /conferir (o MZ chegou
 *    ZERO) -> finalizar_conferencia -> encaminhar_compras -> finalizar_compras -> iniciar_faturamento
 *    -> PUT /fiscal -> POST /processar. Nenhum UPDATE de status a mao.
 *
 * O que se afirma: a fila tem 1 aviso da nota SO com `notificar_recebimento_entrada = '1'` (a jornada
 * roda DUAS vezes, a primeira com '0' — metade positiva); 1 aviso por requisicao que esperava material
 * que entrou LIVRE (R1 e R2, com o link do modulo de origem), nenhum para R3 (so esperava o zero e o
 * retido); reprocessar 400 e a fila nao cresce; a requisicao avisada continua separavel; o zero nao
 * deu entrada e a NC de quantidade continua aberta; a solicitacao de compra fechou (RECEBIDA).
 *
 * Fixtures fora das rotas (e so elas): a tabela CORE `usuarios` (o harness nao a cria — Fase 2, ponto
 * 4), com o e-mail dos dois solicitantes.
 *
 * Executar: cd server && node tests/api/recebimentoAvisoEntradaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 7040, nome: 'Admin E70T4', role: 'admin', is_superadmin: 1, email: 'admin-e70t4@x.com' };
// Quem pede pela tela do Comercial: sem perfil de almoxarifado (cai em PRODUCAO) — a rota de outro
// modulo nao tem requirePermission, e o aprovador e OUTRA pessoa (segregacao da /aprovar).
const VENDEDOR = { id: 7041, nome: 'Vera Vendas E70T4', role: 'usuario', email: 'vera-e70t4@x.com' };
const ALMOX = { id: 7042, nome: 'Alan Almox E70T4', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'alan-e70t4@x.com' };
const LISTA_COMPRAS = 'compras-e70t4@x.com';

let seq = 0;

(async () => {
  console.log('\n=== Etapa 70 T4: aviso de entrada ponta a ponta (rotas) ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });
  const API = '/api/almoxarifado';
  const como = (u) => { setUser({ ...u }); return request(app); };
  const ok = (r, status, oque) => {
    assert.strictEqual(r.status, status, `${oque}: esperava ${status}, veio ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of [ADMIN, VENDEDOR, ALMOX]) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }

  // Configuracao PELA ROTA (a mesma da tela de Configuracoes): a lista de Compras e o destino do aviso
  // da nota (notificacoes_dest_recebimento fica vazia de proposito — o fallback D2); inspecao de
  // critico ligada; o aviso da nota DESLIGADO (o default semeado) para a primeira jornada.
  const cfg = async (corpo) => ok(await como(ADMIN).put(`${API}/configuracoes`).send(corpo), 200, `PUT configuracoes ${JSON.stringify(corpo)}`);
  await cfg({
    notificacoes_dest_compras: LISTA_COMPRAS,
    inspecao_material_critico: '1',
    notificar_recebimento_entrada: '0',
    notificar_recebimento_solicitante: '1',
  });

  const forn = ok(await como(ADMIN).post('/api/compras/fornecedores')
    .send({ razao_social: 'Forn E70T4', cnpj: '70.704.704/0001-70' }), 201, 'POST fornecedor').id;
  const familia = ok(await como(ADMIN).post(`${API}/familias`).send({ nome: 'Fam E70T4' }), 201, 'POST familia').id;

  async function novoMat(rotulo, extra = {}) {
    seq += 1;
    const codigo = `E70T4-${rotulo}-${seq}`;
    const b = ok(await como(ADMIN).post(`${API}/materiais`).send({
      codigo, nome: `Material ${rotulo} ${seq}`, unidade: 'UN', familia_id: familia, ...extra,
    }), 201, `POST material ${rotulo}`);
    return { id: b.id, codigo };
  }
  const saldo = async (id) => (await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
  const statusReq = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const fila = (recId, evento) => dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado
    WHERE evento = ? AND json_extract(payload, '$.recebimento_id') = ? ORDER BY id`, [evento, recId]);
  const filaNota = (recId) => fila(recId, 'RECEBIMENTO_ENTRADA');
  const filaReq = (recId) => fila(recId, 'RECEBIMENTO_ENTRADA_REQUISITANTE');
  const filaTotal = async () => (await dbGet(db, 'SELECT COUNT(*) n FROM fila_notificacoes_almoxarifado')).n;

  /**
   * A jornada inteira, com materiais proprios (as duas rodadas nao se cruzam):
   *  M1 sem saldo, minimo 1 (a reposicao abre a solicitacao) — R1 pede 4, R2 pede 3; chega 7.
   *  MS com saldo 5 (entrada manual pela rota) — R2 pede 2 (reservado na aprovacao).
   *  MZ — R3 pede 2; o pedido traz 5 e chega ZERO.
   *  MC critico — R3 pede 1; chega 3 e fica RETIDO para inspecao.
   */
  async function jornada(tag) {
    const M1 = await novoMat(`${tag}-M1`, { quantidade_minima: 1, quantidade_maxima: 10 });
    const MS = await novoMat(`${tag}-MS`);
    const MZ = await novoMat(`${tag}-MZ`);
    const MC = await novoMat(`${tag}-MC`, { material_critico: 1 });
    ok(await como(ADMIN).post(`${API}/movimentacoes`).send({
      material_id: MS.id, tipo: 'ENTRADA', quantidade: 5, motivo: 'saldo inicial', observacoes: 'E70T4',
    }), 201, 'entrada manual MS');
    assert.strictEqual(await saldo(MS.id), 5);

    const criadas = ok(await como(ADMIN).post(`${API}/compras/verificar-minimos`).send({}), 200, 'verificar-minimos').criadas;
    const sol = criadas.find((c) => c.material_id === M1.id);
    assert.ok(sol, `a reposicao tem de abrir a solicitacao de M1: ${JSON.stringify(criadas)}`);

    // R1: pela rota de OUTRO modulo (a tela do Comercial manda modulo_origem do ctx).
    const r1 = ok(await como(VENDEDOR).post('/api/requisicoes-material').send({
      setor: 'Comercial', modulo_origem: 'comercial', itens: [{ material_id: M1.id, quantidade: 4 }],
    }), 201, 'POST /requisicoes-material (comercial)');
    // R2 e R3: pela rota do almoxarifado (modo armazem: modulo_origem do ctx do almoxarifado).
    const r2 = ok(await como(ALMOX).post(`${API}/requisicoes`).send({
      setor: 'Almoxarifado', modulo_origem: 'almoxarifado',
      itens: [{ material_id: MS.id, quantidade: 2 }, { material_id: M1.id, quantidade: 3 }],
    }), 201, 'POST /almoxarifado/requisicoes R2');
    const r3 = ok(await como(ALMOX).post(`${API}/requisicoes`).send({
      setor: 'Almoxarifado', modulo_origem: 'almoxarifado',
      itens: [{ material_id: MZ.id, quantidade: 2 }, { material_id: MC.id, quantidade: 1 }],
    }), 201, 'POST /almoxarifado/requisicoes R3');

    const aprovar = async (id) => ok(await como(ADMIN).put(`${API}/requisicoes/${id}/aprovar`).send({}), 200, `aprovar ${id}`).status;
    assert.strictEqual(await aprovar(r1.id), 'AGUARDANDO_COMPRA');
    assert.strictEqual(await aprovar(r2.id), 'PARCIALMENTE_RESERVADA');
    assert.strictEqual(await aprovar(r3.id), 'AGUARDANDO_ESTOQUE');

    // O pedido pela rota de COMPRAS, vinculado a solicitacao de M1.
    const pedido = ok(await como(ADMIN).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status: 'aprovado', solicitacao_id: sol.solicitacao_id,
      itens: [
        { material_id: M1.id, quantidade: 7, valor_unitario: 10 },
        { material_id: MZ.id, quantidade: 5, valor_unitario: 10 },
        { material_id: MC.id, quantidade: 3, valor_unitario: 10 },
      ],
    }), 201, 'POST /api/compras/pedidos');
    const linha = (mat) => pedido.itens.find((i) => i.material_id === mat.id).id;

    // O recebimento contra o pedido, com o payload da tela (Etapa 37: sem quantidade_esperada).
    const item = (mat, q) => ({ material_id: mat.id, pedido_item_id: linha(mat), quantidade: q, quantidade_recebida: q });
    const rec = ok(await como(ALMOX).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [item(M1, 7), item(MZ, 5), item(MC, 3)],
    }), 201, 'POST recebimento contra pedido').id;
    const wf = async (acao) => ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/workflow`).send({ acao }), 200, `workflow ${acao}`);
    await wf('iniciar_conferencia');
    const itemZ = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id = ?', [rec, MZ.id]);
    ok(await como(ALMOX).put(`${API}/recebimentos/${rec}/conferir`)
      .send({ itens: [{ id: itemZ.id, quantidade_recebida: 0 }] }), 200, 'conferir (MZ chegou zero)');
    await wf('finalizar_conferencia');
    await wf('encaminhar_compras');
    await wf('finalizar_compras');
    await wf('iniciar_faturamento');
    ok(await como(ADMIN).put(`${API}/recebimentos/${rec}/fiscal`).send({
      nota_fiscal: `NF-E70T4-${tag}`, data_emissao_nf: '2026-09-28', data_entrada_nf: '2026-09-29', valor_total_nota: 100,
    }), 200, 'PUT fiscal');
    const proc = ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/processar`).send({}), 200, 'processar');
    assert.strictEqual(proc.status, 'PROCESSADO');

    return { M1, MS, MZ, MC, r1, r2, r3, sol, pedido, rec, itemZ };
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // RODADA A — o aviso da nota DESLIGADO (o default semeado): nada da nota; os solicitantes sim.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  let A = null;
  await test("(A) notificar_recebimento_entrada='0': a jornada inteira roda e a fila NAO tem aviso da nota", async () => {
    A = await jornada('A');
    assert.strictEqual((await filaNota(A.rec)).length, 0, "com a chave em '0' nenhum aviso da nota");
    const req = await filaReq(A.rec);
    assert.deepStrictEqual(req.map((l) => JSON.parse(l.payload).requisicao_id).sort((x, y) => x - y),
      [A.r1.id, A.r2.id], 'o aviso ao solicitante tem chave propria e continua ligado');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // RODADA B — ligado pela rota. Daqui em diante tudo afirma sobre esta jornada.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  let B = null;
  await test("(B) ligado pela rota: EXATAMENTE 1 aviso da nota, para a lista de Compras, citando pedido, itens e requisicoes", async () => {
    await cfg({ notificar_recebimento_entrada: '1' });
    B = await jornada('B');
    const nota = await filaNota(B.rec);
    assert.strictEqual(nota.length, 1, `um aviso por nota: ${nota.length}`);
    const [l] = nota;
    assert.deepStrictEqual(JSON.parse(l.destinatarios), [LISTA_COMPRAS], 'lista propria vazia -> a lista de Compras');
    const t = l.corpo_texto;
    assert.ok(t.includes(`Pedido de compra: ${B.pedido.numero}`), t);
    assert.ok(new RegExp(`^- ${B.M1.codigo} — [^\\n]*: 7 UN[^\\n]* — disponível$`, 'm').test(t), t);
    assert.ok(new RegExp(`^- ${B.MC.codigo} — [^\\n]*: 3 UN[^\\n]* — retido para inspeção$`, 'm').test(t), t);
    assert.ok(!t.includes(B.MZ.codigo), `o item que chegou ZERO nao entrou e nao pode ser anunciado: ${t}`);
    // Decisao B da T1: a linha de requisicoes da nota e a plateia de Compras — lista quem espera
    // QUALQUER material que entrou (o R3 espera o critico retido).
    for (const r of [B.r1, B.r2, B.r3]) assert.ok(t.includes(r.numero), `${r.numero} na linha de requisicoes: ${t}`);
    const p = JSON.parse(l.payload);
    assert.strictEqual(p.itens, 2, 'dois itens entraram (o zero nao)');
    assert.deepStrictEqual([...p.requisicoes].sort((x, y) => x - y), [B.r1.id, B.r2.id, B.r3.id]);
  });

  await test('(B) 1 aviso por requisicao que esperava material LIVRE, com o link do modulo de origem; nada para o zero nem para o retido', async () => {
    const req = await filaReq(B.rec);
    const porReq = new Map(req.map((l) => [JSON.parse(l.payload).requisicao_id, l]));
    assert.deepStrictEqual([...porReq.keys()].sort((x, y) => x - y), [B.r1.id, B.r2.id],
      `exatamente R1 e R2 (R3 so esperava o MZ, que chegou zero, e o MC, retido): ${JSON.stringify([...porReq.keys()])}`);
    assert.strictEqual(req.length, 2);

    const l1 = porReq.get(B.r1.id);
    assert.deepStrictEqual(JSON.parse(l1.destinatarios), [VENDEDOR.email]);
    assert.ok(/^Link: \S*\/comercial\/requisicoes-material$/m.test(l1.corpo_texto),
      `quem pediu pelo Comercial recebe o link do Comercial: ${l1.corpo_texto}`);
    // Etapa 74 (C121, D5/D7): a chegada reservou os 4 de R1 e os 3 de R2 (eram 7) — o status acompanha e o
    // e-mail diz quanto ficou reservado. Antes da 74: "Aguardando compra" e "(pendente na requisição: 4 UN)".
    assert.ok(l1.corpo_texto.includes('Situação da requisição: Totalmente reservada'), l1.corpo_texto);
    assert.ok(l1.corpo_texto.includes(`- ${B.M1.codigo} — `)
      && l1.corpo_texto.includes(': entrou 7 UN (pendente na requisição: 4 UN; reservado para a sua requisição: 4 UN)'), l1.corpo_texto);

    const l2 = porReq.get(B.r2.id);
    assert.deepStrictEqual(JSON.parse(l2.destinatarios), [ALMOX.email]);
    assert.ok(/^Link: \S*\/almoxarifado\/requisicoes-material$/m.test(l2.corpo_texto), l2.corpo_texto);
    // Etapa 74: R2 tinha o MS reservado na aprovação e ganhou os 3 de M1 na chegada -> Totalmente reservada.
    assert.ok(l2.corpo_texto.includes('Situação da requisição: Totalmente reservada'), l2.corpo_texto);
    assert.ok(l2.corpo_texto.includes(': entrou 7 UN (pendente na requisição: 3 UN; reservado para a sua requisição: 3 UN)'), l2.corpo_texto);
    assert.ok(!l2.corpo_texto.includes(B.MS.codigo), `o item ja reservado (MS) nao e "chegou": ${l2.corpo_texto}`);
  });

  await test('(B) reprocessar: 400 e a fila nao cresce', async () => {
    const antes = await filaTotal();
    const r = await como(ADMIN).post(`${API}/recebimentos/${B.rec}/processar`).send({});
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Nota já processada');
    assert.strictEqual(await filaTotal(), antes, 'reprocessar nao pode enfileirar nada');
    assert.strictEqual((await filaNota(B.rec)).length, 1);
    assert.strictEqual((await filaReq(B.rec)).length, 2);
  });

  await test('(B) o estoque: M1 entrou 7, o critico retido, o ZERO nao entrou e a divergencia continua registrada; a solicitacao fechou', async () => {
    assert.strictEqual(await saldo(B.M1.id), 7);
    assert.strictEqual(await saldo(B.MZ.id), 0, 'chegou zero nao da entrada pela esperada');
    const ic = await dbGet(db, `SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ? AND material_id = ?`, [B.rec, B.MC.id]);
    assert.strictEqual(Number(ic.quantidade_em_inspecao), 3, 'o critico entrou retido para inspecao');
    const nc = await dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'`, [B.itemZ.id]);
    assert.strictEqual(nc.length, 1, 'a conferencia com 0 abre a NC de quantidade');
    assert.strictEqual(nc[0].divergencia, -5);
    assert.notStrictEqual(nc[0].status, 'CANCELADA', 'a divergencia continua registrada depois de processar');
    const sol = await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [B.sol.solicitacao_id]);
    assert.strictEqual(sol.status, 'RECEBIDA');
  });

  // Etapa 74 (C121): a D4 da 70 ("o status nao se ajusta sozinho") deixou de valer — a chegada reserva para quem
  // esperava e o status acompanha (D5/B371). O gesto seguinte (separar) continua aceito.
  await test('(B) a requisicao avisada ganhou a reserva na chegada e continua SEPARAVEL (Etapa 74; era "continua como estava")', async () => {
    assert.strictEqual(await statusReq(B.r1.id), 'TOTALMENTE_RESERVADA', 'Etapa 74: a chegada reservou os 4 de R1');
    assert.strictEqual(await statusReq(B.r2.id), 'TOTALMENTE_RESERVADA', 'Etapa 74: MS da aprovacao + M1 da chegada');
    const item = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [B.r1.id]);
    const s = ok(await como(ADMIN).put(`${API}/requisicoes/${B.r1.id}/separar`)
      .send({ itens_separados: [{ item_id: item.id, quantidade_separada: 4 }] }), 200, 'separar R1');
    assert.ok(s, 'a separacao respondeu');
    assert.strictEqual(await statusReq(B.r1.id), 'EM_SEPARACAO');
    const sep = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [item.id]);
    assert.strictEqual(Number(sep.quantidade_separada), 4);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
