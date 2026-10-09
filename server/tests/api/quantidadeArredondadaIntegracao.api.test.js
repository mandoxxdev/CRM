/**
 * Etapa 96 T5 — integracao: a quantidade arredondada atravessa o modulo, pela rota e pelo servico (C176; cruza T1, T2,
 * T3 e T4).
 *
 * A deriva nasce numa porta (entrada, separacao, bloqueio, retorno) e prende o gesto EM OUTRA (saida, entrega,
 * desbloqueio, remessa) — cada task da 96 fecha a sua porta e fica verde sozinha. Aqui os decimais que derivam em
 * ponto flutuante (0,1 + 0,2; 0,7 + 0,2 + 0,1) atravessam entrada -> transferencia -> reserva -> aprovacao ->
 * separacao -> entrega -> devolucao -> estorno -> remessa a terceiro/retorno -> inventario, ate o ultimo gesto. No fim
 * de cada jornada (`fecharMaterial`):
 *   - o saldo PELA ROTA (`GET /materiais/:id`) e igual a conta do teste — a conta e feita em micro-unidades inteiras,
 *     entao o esperado e o double limpo do decimal: compara-se com 1e-6 E por igualdade estrita (so 1e-6 aceitaria
 *     0.9999999999999999, que e justamente o defeito);
 *   - o livro e coerente: cada `saldo_anterior` e o `saldo_posterior` do movimento anterior, nenhum guarda residuo, e o
 *     ultimo bate com o fisico; as linhas de saldo somam o fisico e nenhuma guarda residuo;
 *   - a A47 (`quantidadeLegado.listarTortos`) nao acha nada do material.
 *
 *  I1 — pela rota, material em KG: entrada 0,7 + 0,2 + 0,1 no endereco A -> transferencia 1 para B -> saida 0,4 de B ->
 *       reservas 0,1 + 0,2 + 0,3 (a folga nao inventa: saida 0,000001 recusada) -> liberar as tres -> saida 0,6 ->
 *       fisico 0, nenhuma linha com residuo; depois entrada 0,1 + 0,2, estorno da de 0,1, saida 0,2 -> 0.
 *  I2 — pela rota, o legado (fisico 0.9999… escrito direto) e os escritores de fora do motor: bloquear 0,7 + 0,2 +
 *       0,1 -> desbloquear 1 -> remessa de 1 (criar + enviar) -> retornos 0,7 + 0,2 + 0,1 (ENCERRADA) -> bloquear
 *       0,1 + 0,2 + 0,1 -> remessa de duas linhas 0,4 + 0,2 com 0,6 livre -> desbloquear 0,4 -> retornos 0,1 + 0,2 +
 *       0,1 e 0,2 (ENCERRADA) -> inventario contado 0,9 e concluido com ajuste -> saida 0,9 -> 0. Bloqueio, remessa e
 *       retorno nao escrevem o fisico: a coluna legada fica 0.9999… ate o ajuste (B483), sem prender gesto nenhum.
 *  I3 — pela rota, a requisicao de ponta a ponta sobre o legado: S pede 1 -> ADMIN aprova (TOTALMENTE_RESERVADA,
 *       reserva 1) -> ALMOX separa 0,7 + 0,2 + 0,1 -> fila e detalhe dizem 1 -> entrega 0,1 + 0,2 + 0,7 -> ENTREGUE,
 *       reserva CONSUMIDA (utilizada 1) -> devolucoes 0,1 + 0,2 da saida de 0,7 -> estorno da devolucao de 0,1 ->
 *       saida 0,2 -> 0.
 *  I4 — pelo servico: registrarMovimentacao (entrada 0,7/0,2/0,1 e saida 1), criarReserva (1 sobre o legado),
 *       separarRequisicao e entregarRequisicao em rodadas fracionadas; e o `{ status: 400 }` com a literal M1 para a
 *       saida de 1,000001 com fisico 1.
 *  I5 — o legado normalizado NO MEIO nao muda nada que ja funcionava: I3 ate a separacao, conferencia aberta e contada
 *       sobre o torto, `normalizar(db, { aplicar: true })`, o livro igual (contagem e soma), a conferencia conclui sem
 *       ajuste, a entrega fecha ENTREGUE.
 *  I6 — o legado em varias colunas (fisico, linha de endereco, reserva) atravessa transferencia, reserva, liberacao e
 *       saida e sai limpo sozinho; um segundo legado parado e achado pela CLI (sem --aplicar nao grava; com --aplicar a
 *       copia fica limpa e o livro intacto) e pelo servico; no fim, a A47 do banco inteiro vazia.
 *
 * Usuarios reais por header (molde 92-95): S sem perfil (PRODUCAO) pede; ADMIN superadmin aprova; ALMOX (ALMOXARIFE)
 * movimenta, transfere, reserva, separa, entrega, devolve, remessa e conta; GESTOR estorna, bloqueia e conclui o
 * inventario com ajuste (`ajustar_estoque`). O legado e montado por ESCRITOR DIRETO (Tecnica 1 do plano).
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md (T5, I1-I5)
 * Executar: cd server && node tests/api/quantidadeArredondadaIntegracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const stockService = require('../../services/almoxarifado/stockService');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const L = require('../../services/almoxarifado/quantidadeLegado');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 96 T5', role: 'admin', is_superadmin: 1, email: 'a96t5@t.com' },
  S: { id: 9651, nome: 'Solic 96 T5', role: 'user', email: 's96t5@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9652, nome: 'Almox 96 T5', role: 'user', email: 'x96t5@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  GESTOR: { id: 9653, nome: 'Gestor 96 T5', role: 'user', email: 'g96t5@t.com', perfil_almoxarifado: PERFIS.GESTOR },
};
const API = '/api/almoxarifado';
const TORTO = 0.9999999999999999; // 0,7 + 0,2 + 0,1 somados em ponto flutuante
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'normalizar-quantidades-almoxarifado.js');
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// A conta do teste em micro-unidades INTEIRAS: somar 0,1 + 0,2 aqui nao deriva, e `micros / 1e6` e o double mais
// proximo do decimal — o mesmo que o ROUND(x, 6) do banco devolve.
const MICRO = (q) => Math.round(Number(q) * 1e6);

(async () => {
  console.log('\n=== Etapa 96 T5: integracao — a quantidade arredondada de ponta a ponta, rota e servico ===\n');
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
  const ok = (r, msg = '') => assert.ok(r.status === 200 || r.status === 201, `${msg}: ${r.status} ${JSON.stringify(r.body)}`);

  // ── fixtures; `conta` e o livro do teste (micro-unidades), `inicio` o fisico de partida (o legado entra arredondado) ──
  const conta = new Map();
  const nomes = new Map();
  const somar = (m, q) => conta.set(m, conta.get(m) + MICRO(q));
  const esperado = (m) => conta.get(m) / 1e6;
  const material = async ({ unidade = 'PC', categoria = null } = {}) => {
    const c = `E96I-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario, categoria) VALUES (?, ?, ?, 0, 0, 1, 0, 0.1, ?)`, [c, c, unidade, categoria])).lastID;
    conta.set(id, 0); nomes.set(id, c);
    return id;
  };
  // O legado: o fisico e a linha de saldo sem endereco escritos direto como o motor antigo os deixava (0,7 + 0,2 + 0,1).
  // A linha entra junto porque o motor antigo gravava as duas: um material SEM linha nenhuma e o "legado puro" da
  // Etapa 51 (a saida cria a linha NULL negativa, -1 com fisico 0 — medido, igual com o fisico limpo; nao e da 96).
  const legado = async (opts) => {
    const m = await material(opts);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    await dbRun(db, "INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?, NULL, ?)", [m, TORTO]);
    assert.strictEqual((await dbGet(db, "SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?", [m])).q, TORTO,
      'premissa: o legado ficou torto');
    conta.set(m, MICRO(1));
    return m;
  };
  let nloc = 0;
  const loc = async () => { const c = `E96IL-${++nloc}`; return (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID; };
  const linha = async (m, l) => (await dbGet(db, 'SELECT quantidade q FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id IS ? AND lote_id IS NULL', [m, l]))?.q;
  const mov = (m, tipo, quantidade, extra = {}, u = 'ALMOX') => como(u).post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo, quantidade, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5', ...extra,
  });
  const SINAL = { ENTRADA: 1, SAIDA: -1, TRANSFERENCIA: 0 };
  const movOk = async (m, tipo, q, extra = {}) => {
    const r = await mov(m, tipo, q, extra);
    assert.strictEqual(r.status, 201, `${tipo} ${q}: ${JSON.stringify(r.body)}`);
    somar(m, SINAL[tipo] * q);
    return r.body;
  };
  const ultimaMov = async (m, tipo) => (await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m, tipo]));
  const estornar = (movId) => como('GESTOR').post(`${API}/movimentacoes/${movId}/cancelar`, { motivo: 'teste da etapa 96 T5' });
  const reservar = (m, q) => como('ALMOX').post(`${API}/reservas`, { material_id: m, quantidade: q, os_referencia: 'OS-96T5' });
  const liberar = (id) => como('ALMOX').post(`${API}/reservas/${id}/liberar`, { motivo: 'e96t5' });
  const colunas = (m) => dbGet(db, `SELECT quantidade_atual, quantidade_reservada, quantidade_bloqueada, quantidade_em_inspecao,
      quantidade_em_terceiros FROM materiais_almoxarifado WHERE id = ?`, [m]);

  // requisicao: S pede pela rota, ADMIN aprova pela rota
  const aprovada = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-96T5', itens: [{ material_id: m, quantidade: q }],
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const row = await dbGet(db, 'SELECT solicitante_id FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    assert.strictEqual(Number(row.solicitante_id), USERS.S.id, 'quem pediu foi S');
    ok(await como('ADMIN').put(`${API}/requisicoes/${cr.body.id}/aprovar`, {}), 'aprovar');
    const it = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [cr.body.id]);
    return { R: cr.body.id, I: it.id };
  };
  const separar = (R, I, q) => como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: I, quantidade_separada: q }] });
  const entregar = (R, I, q) => como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: I, quantidade_atendida: q }] });
  const statusReq = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status;
  const reservasDe = (R) => dbAll(db, 'SELECT quantidade, quantidade_utilizada, status FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
  const itemReq = (I) => dbGet(db, 'SELECT quantidade_separada, quantidade_entregue, quantidade_atendida FROM itens_requisicao_almoxarifado WHERE id = ?', [I]);
  const daFila = async (R, I) => {
    const f = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const l = f.body.find((x) => Number(x.id) === Number(R));
    assert.ok(l, `a requisicao ${R} nao esta na fila`);
    return l.itens.find((i) => Number(i.item_id) === Number(I));
  };
  const detalhe = async (R, I) => {
    const d = await como('ALMOX').get(`${API}/requisicoes/${R}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    return d.body.itens.find((i) => Number(i.id) === Number(I));
  };

  // ── A47 por material: cada linha torta de COLUNAS_LEGADO cujo dono e `m` ──
  const DONO = {
    materiais_almoxarifado: 'id',
    estoque_saldo_almoxarifado: 'material_id',
    reservas_material_almoxarifado: 'material_id',
    itens_requisicao_almoxarifado: 'material_id',
    itens_remessa_terceiro_almoxarifado: 'material_id',
    recebimentos_material_itens_almoxarifado: 'material_id',
  };
  const a47 = async (m) => {
    const out = [];
    for (const t of await L.listarTortos(db)) {
      assert.ok(DONO[t.tabela], `tabela sem dono conhecido: ${t.tabela}`);
      const r = await dbGet(db, `SELECT ${DONO[t.tabela]} dono FROM ${t.tabela} WHERE id = ?`, [t.id]);
      if (Number(r.dono) === Number(m)) out.push(`${t.tabela}.${t.coluna}#${t.id}=${t.valor}`);
    }
    return out;
  };
  const livroDe = (m) => dbAll(db, `SELECT id, tipo, quantidade, saldo_anterior, saldo_posterior FROM movimentacoes_almoxarifado
      WHERE material_id = ? ORDER BY id`, [m]);
  /**
   * O fim de toda jornada. `retido` = as retencoes esperadas (default: nenhuma). `inicio` = o fisico antes do primeiro
   * movimento do teste (o legado entra pelo numero arredondado: o livro novo grava `Q.qtd`).
   */
  const fecharMaterial = async (m, rotulo, { retido = {}, inicio = 0 } = {}) => {
    const r = await como('ALMOX').get(`${API}/materiais/${m}`);
    assert.strictEqual(r.status, 200, `${rotulo}: GET material ${JSON.stringify(r.body)}`);
    const q = r.body.quantidade_atual;
    const e = esperado(m);
    assert.ok(Math.abs(q - e) < 1e-6, `${rotulo}: saldo pela rota ${q} longe da conta do teste ${e}`);
    assert.strictEqual(q, e, `${rotulo}: saldo pela rota ${q} com residuo (a conta do teste diz ${e})`);
    const ret = {
      quantidade_reservada: 0, quantidade_bloqueada: 0, quantidade_em_inspecao: 0, quantidade_em_terceiros: 0, ...retido,
    };
    for (const [k, v] of Object.entries(ret)) assert.strictEqual(Number(r.body[k] || 0), v, `${rotulo}: ${k} pela rota`);
    // o livro
    const livro = await livroDe(m);
    assert.ok(livro.length > 0, `${rotulo}: livro vazio`);
    let antes = inicio;
    for (const l of livro) {
      for (const c of ['quantidade', 'saldo_anterior', 'saldo_posterior']) {
        const x = l[c];
        if (x === null) continue;
        const rd = (await dbGet(db, 'SELECT ROUND(?, 6) r', [x])).r;
        assert.strictEqual(x, rd, `${rotulo}: o livro guarda residuo em ${l.tipo}#${l.id}.${c} = ${x}`);
      }
      assert.strictEqual(l.saldo_anterior, antes,
        `${rotulo}: livro quebrado em ${l.tipo}#${l.id} (saldo_anterior ${l.saldo_anterior}, o anterior terminou em ${antes}): ${JSON.stringify(livro)}`);
      antes = l.saldo_posterior;
    }
    assert.strictEqual(antes, q, `${rotulo}: o ultimo saldo_posterior do livro (${antes}) nao e o fisico ${q}`);
    // as linhas de saldo
    const linhas = await dbAll(db, 'SELECT id, localizacao_id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ?', [m]);
    const soma = linhas.reduce((s, l) => s + MICRO(l.quantidade), 0) / 1e6;
    assert.strictEqual(soma, q, `${rotulo}: as linhas somam ${soma}, o fisico e ${q}: ${JSON.stringify(linhas)}`);
    // a A47
    assert.deepStrictEqual(await a47(m), [], `${rotulo}: a A47 achou o material`);
  };

  // ═══════════════════════════ I1 — pela rota, a nota em KG e o gesto inteiro ═══════════════════════════
  await test('[96 I1] KG pela rota: entrada 0,7 + 0,2 + 0,1 em A -> transferencia 1 -> saida 0,4 -> reservas 0,1 + 0,2 + 0,3 -> liberar -> saida 0,6 -> fisico 0, linhas 0', async () => {
    const m = await material({ unidade: 'KG' });
    const A = await loc(); const B = await loc();
    for (const q of [0.7, 0.2, 0.1]) await movOk(m, 'ENTRADA', q, { localizacao_destino_id: A });
    const g = await como('ALMOX').get(`${API}/materiais/${m}`);
    assert.strictEqual(g.body.quantidade_atual, 1, 'GET depois das entradas');
    assert.strictEqual(await linha(m, A), 1, 'a linha de A');
    await movOk(m, 'TRANSFERENCIA', 1, { localizacao_origem_id: A, localizacao_destino_id: B });
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [0, 1], 'A e B depois da transferencia');
    await movOk(m, 'SAIDA', 0.4, { localizacao_origem_id: B });
    const ids = [];
    for (const q of [0.1, 0.2, 0.3]) {
      const rv = await reservar(m, q);
      assert.strictEqual(rv.status, 201, `reserva ${q}: ${JSON.stringify(rv.body)}`);
      ids.push(rv.body.id);
    }
    assert.deepStrictEqual([(await colunas(m)).quantidade_atual, (await colunas(m)).quantidade_reservada], [0.6, 0.6]);
    // a folga nao inventa estoque: tudo reservado, nada livre
    const s = await mov(m, 'SAIDA', 0.000001, { localizacao_origem_id: B });
    assert.strictEqual(s.status, 400, `saida de 0,000001 com tudo reservado: ${JSON.stringify(s.body)}`);
    for (const id of ids) ok(await liberar(id), `liberar ${id}`);
    assert.strictEqual((await colunas(m)).quantidade_reservada, 0, 'reservado depois de liberar 0,1 + 0,2 + 0,3');
    await movOk(m, 'SAIDA', 0.6, { localizacao_origem_id: B });
    const comResto = await dbAll(db, 'SELECT id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade <> 0', [m]);
    assert.deepStrictEqual(comResto, [], 'linha de endereco com resto');
    assert.strictEqual((await ultimaMov(m, 'SAIDA')).saldo_posterior, 0);
    await fecharMaterial(m, 'I1');
    // o estorno no meio: entrada 0,1 + 0,2, o GESTOR estorna a de 0,1, a saida de 0,2 zera
    await movOk(m, 'ENTRADA', 0.1, { localizacao_destino_id: A });
    const e01 = (await ultimaMov(m, 'ENTRADA')).id;
    await movOk(m, 'ENTRADA', 0.2, { localizacao_destino_id: A });
    ok(await estornar(e01), 'estornar a entrada de 0,1');
    somar(m, -0.1);
    assert.strictEqual((await colunas(m)).quantidade_atual, 0.2, 'fisico depois do estorno');
    await movOk(m, 'SAIDA', 0.2, { localizacao_origem_id: A });
    await fecharMaterial(m, 'I1 (estorno)');
  });

  // ═══════════════════ I2 — pela rota, o legado e os escritores de fora do motor ═══════════════════
  await test('[96 I2] legado 0.9999… pela rota: bloquear 0,7 + 0,2 + 0,1 -> desbloquear 1 -> remessa 1 -> retornos 0,7 + 0,2 + 0,1 -> bloquear 0,4 -> remessa 0,4 + 0,2 -> retornos -> inventario 0,9 -> saida 0,9 -> 0', async () => {
    const m = await legado({ categoria: 'CAT-E96T5-I2' });
    for (const q of [0.7, 0.2, 0.1]) {
      ok(await como('GESTOR').post(`${API}/materiais/${m}/bloquear`, { quantidade: q, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' }), `bloquear ${q}`);
    }
    assert.strictEqual((await colunas(m)).quantidade_bloqueada, 1, 'bloqueado 0,7 + 0,2 + 0,1');
    ok(await como('GESTOR').post(`${API}/materiais/${m}/desbloquear`, { quantidade: 1, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' }), 'desbloquear 1');
    const cr = await como('ALMOX').post(`${API}/remessas-terceiros`, {
      fornecedor_nome: 'Terceiro 96 T5', tipo_servico: 'Galvanizacao', itens: [{ material_id: m, quantidade: 1 }],
    });
    assert.strictEqual(cr.status, 201, `criar remessa: ${JSON.stringify(cr.body)}`);
    const itemRem = (await dbGet(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [cr.body.id])).id;
    ok(await como('ALMOX').post(`${API}/remessas-terceiros/${cr.body.id}/enviar`), 'enviar a remessa de 1 sobre o legado');
    assert.strictEqual((await colunas(m)).quantidade_em_terceiros, 1);
    for (const q of [0.7, 0.2, 0.1]) {
      ok(await como('ALMOX').post(`${API}/remessas-terceiros/${cr.body.id}/retornos`, { itens: [{ item_remessa_id: itemRem, quantidade: q }] }), `retorno ${q}`);
    }
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_retornada q FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [itemRem])).q, 1, 'retornada 0,7 + 0,2 + 0,1');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [cr.body.id])).status, 'ENCERRADA');
    // segunda volta, com o disponivel como diferenca: bloquear 0,1 + 0,2 + 0,1 (0,4) deixa 0,6 livre; a remessa de
    // duas linhas 0,4 + 0,2 soma 0.6000000000000001 no JS e tem de caber; os retornos 0,1 + 0,2 + 0,1 no item de 0,4
    for (const q of [0.1, 0.2]) {
      ok(await como('GESTOR').post(`${API}/materiais/${m}/bloquear`, { quantidade: q, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' }), `bloquear ${q}`);
    }
    assert.strictEqual((await colunas(m)).quantidade_bloqueada, 0.3, 'bloqueado 0,1 + 0,2');
    ok(await como('GESTOR').post(`${API}/materiais/${m}/bloquear`, { quantidade: 0.1, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' }), 'bloquear 0,1');
    assert.strictEqual(await stockService.getSaldoDisponivel(await stockService.getMaterial(db, m)), 0.6, 'livre depois do bloqueio de 0,4');
    const cr2 = await como('ALMOX').post(`${API}/remessas-terceiros`, {
      fornecedor_nome: 'Terceiro 96 T5', tipo_servico: 'Galvanizacao', itens: [{ material_id: m, quantidade: 0.4 }, { material_id: m, quantidade: 0.2 }],
    });
    assert.strictEqual(cr2.status, 201, `criar a segunda remessa: ${JSON.stringify(cr2.body)}`);
    const [it04, it02] = (await dbAll(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [cr2.body.id])).map((x) => x.id);
    ok(await como('ALMOX').post(`${API}/remessas-terceiros/${cr2.body.id}/enviar`), 'enviar 0,4 + 0,2 com 0,6 livre');
    assert.strictEqual((await colunas(m)).quantidade_em_terceiros, 0.6);
    ok(await como('GESTOR').post(`${API}/materiais/${m}/desbloquear`, { quantidade: 0.4, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' }), 'desbloquear 0,4');
    const retornar2 = (it, q) => como('ALMOX').post(`${API}/remessas-terceiros/${cr2.body.id}/retornos`, { itens: [{ item_remessa_id: it, quantidade: q }] });
    const retornada = async (it) => (await dbGet(db, 'SELECT quantidade_retornada q FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [it])).q;
    for (const q of [0.1, 0.2]) ok(await retornar2(it04, q), `retorno ${q}`);
    assert.strictEqual(await retornada(it04), 0.3, 'retornada 0,1 + 0,2');
    ok(await retornar2(it04, 0.1), 'retorno 0,1');
    ok(await retornar2(it02, 0.2), 'retorno 0,2');
    assert.deepStrictEqual([await retornada(it04), await retornada(it02)], [0.4, 0.2]);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [cr2.body.id])).status, 'ENCERRADA');
    // bloqueio, remessa e retorno movem as retencoes, nao o fisico: a coluna legada continua 0.9999… (B483 — o legado
    // se cura na primeira escrita do fisico), e nenhum gesto ficou preso por isso
    assert.deepStrictEqual({ ...(await colunas(m)) }, {
      quantidade_atual: TORTO, quantidade_reservada: 0, quantidade_bloqueada: 0, quantidade_em_inspecao: 0, quantidade_em_terceiros: 0,
    });
    assert.strictEqual(await stockService.getSaldoDisponivel(await stockService.getMaterial(db, m)), 1, 'o disponivel sai arredondado');
    // o inventario: conta 0,9 e o GESTOR conclui com ajuste
    const conf = await como('ALMOX').post(`${API}/conferencias`, { categoria: 'CAT-E96T5-I2', tolerancia_percentual: 100 });
    ok(conf, 'abrir a conferencia');
    const ic = await dbGet(db, 'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?', [conf.body.id, m]);
    assert.ok(ic, 'o material entrou na conferencia');
    assert.strictEqual(ic.quantidade_sistema, TORTO, 'a conferencia abre sobre o legado (a contagem e registro, B483)');
    ok(await como('ALMOX').put(`${API}/conferencias/${conf.body.id}/item/${ic.id}`, { quantidade_contada: 0.9 }), 'contar 0,9');
    ok(await como('GESTOR').put(`${API}/conferencias/${conf.body.id}/concluir`, { aplicar_ajustes: true, justificativa_ajuste: 'contagem da etapa 96 T5' }), 'concluir com ajuste');
    somar(m, -0.1);
    assert.strictEqual((await colunas(m)).quantidade_atual, 0.9, 'fisico depois do ajuste do inventario');
    await movOk(m, 'SAIDA', 0.9);
    await fecharMaterial(m, 'I2', { inicio: 1 });
  });

  // ═══════════════════ I3 — pela rota, a requisicao de ponta a ponta ═══════════════════
  await test('[96 I3] requisicao sobre o legado: aprovar (reserva 1) -> separar 0,7 + 0,2 + 0,1 -> entregar 0,1 + 0,2 + 0,7 -> ENTREGUE -> devolver 0,1 + 0,2 -> estornar a de 0,1 -> saida 0,2 -> 0', async () => {
    const m = await legado();
    const { R, I } = await aprovada(m, 1);
    assert.strictEqual(await statusReq(R), 'TOTALMENTE_RESERVADA');
    assert.deepStrictEqual((await reservasDe(R)).map((r) => r.quantidade), [1]);
    for (const q of [0.7, 0.2, 0.1]) ok(await separar(R, I, q), `separar ${q}`);
    assert.strictEqual((await itemReq(I)).quantidade_separada, 1, 'separada 0,7 + 0,2 + 0,1');
    assert.strictEqual((await daFila(R, I)).entregavel, 1, 'fila: entregavel');
    assert.strictEqual((await detalhe(R, I)).quantidade_entregavel, 1, 'detalhe: quantidade_entregavel');
    for (const q of [0.1, 0.2, 0.7]) { ok(await entregar(R, I, q), `entregar ${q}`); somar(m, -q); }
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.deepStrictEqual({ ...(await itemReq(I)) }, { quantidade_separada: 1, quantidade_entregue: 1, quantidade_atendida: 1 });
    assert.deepStrictEqual((await reservasDe(R)).map((r) => [r.quantidade_utilizada, r.status]), [[1, 'CONSUMIDA']]);
    assert.deepStrictEqual([(await colunas(m)).quantidade_atual, (await colunas(m)).quantidade_reservada], [0, 0], 'fisico 0 (nao 2,8e-17)');
    await fecharMaterial(m, 'I3 (entregue)', { inicio: 1 });
    // devolucao fracionada da saida de 0,7 e o estorno de uma delas
    const saida07 = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' AND quantidade = 0.7", [m]);
    assert.ok(saida07, 'premissa: a saida de 0,7 da entrega');
    const devolver = (q) => como('ALMOX').post(`${API}/devolucoes`, {
      material_id: m, quantidade: q, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saida07.id,
    });
    ok(await devolver(0.1), 'devolver 0,1'); somar(m, 0.1);
    const dev01 = (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m])).id;
    ok(await devolver(0.2), 'devolver 0,2'); somar(m, 0.2);
    assert.strictEqual((await colunas(m)).quantidade_atual, 0.3, 'fisico depois das devolucoes 0,1 + 0,2');
    ok(await estornar(dev01), 'estornar a devolucao de 0,1'); somar(m, -0.1);
    assert.strictEqual((await colunas(m)).quantidade_atual, 0.2, 'fisico depois do estorno');
    await movOk(m, 'SAIDA', 0.2);
    await fecharMaterial(m, 'I3', { inicio: 1 });
  });

  // ═══════════════════ I4 — pelo servico ═══════════════════
  await test('[96 I4] pelo servico: registrarMovimentacao 0,7 + 0,2 + 0,1 e saida 1; criarReserva 1 no legado; separar/entregar em rodadas; saida 1,000001 -> { status: 400 } M1', async () => {
    const adm = { ...USERS.ADMIN };
    const m = await material();
    for (const q of [0.7, 0.2, 0.1]) {
      await stockService.registrarMovimentacao(db, adm, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e96t5' });
      somar(m, q);
    }
    assert.strictEqual((await colunas(m)).quantidade_atual, 1);
    let erro = null;
    try {
      await stockService.registrarMovimentacao(db, adm, { material_id: m, tipo: 'SAIDA', quantidade: 1.000001, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' });
    } catch (e) { erro = e; }
    assert.ok(erro, 'a saida de 1,000001 com fisico 1 passou');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, 'Saldo insuficiente. Disponível: 1 PC');
    await stockService.registrarMovimentacao(db, adm, { material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'e96t5', justificativa: 'teste da etapa 96 T5' });
    somar(m, -1);
    await fecharMaterial(m, 'I4 (motor)');

    // criarReserva sobre o legado, liberada
    const lg = await legado();
    const rv = await stockService.criarReserva(db, adm, { material_id: lg, quantidade: 1, os_referencia: 'OS-96T5' });
    assert.strictEqual((await colunas(lg)).quantidade_reservada, 1, 'reserva 1 sobre 0.9999…');
    await stockService.liberarReserva(db, adm, rv.id);
    // a requisicao com separacao e entrega pelo servico
    const { R, I } = await aprovada(lg, 1);
    assert.strictEqual(await statusReq(R), 'TOTALMENTE_RESERVADA');
    for (const q of [0.7, 0.2, 0.1]) await requisitionService.separarRequisicao(db, R, [{ item_id: I, quantidade_separada: q }], { ...USERS.ALMOX });
    assert.strictEqual((await itemReq(I)).quantidade_separada, 1, 'separada pelo servico 0,7 + 0,2 + 0,1');
    for (const q of [0.1, 0.2, 0.7]) {
      await requisitionService.entregarRequisicao(db, R, [{ item_id: I, quantidade_atendida: q }], { ...USERS.ALMOX });
      somar(lg, -q);
    }
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    assert.deepStrictEqual({ ...(await itemReq(I)) }, { quantidade_separada: 1, quantidade_entregue: 1, quantidade_atendida: 1 });
    await fecharMaterial(lg, 'I4 (requisicao)', { inicio: 1 });
  });

  // ═══════════════════ I5 — o legado normalizado no meio ═══════════════════
  await test('[96 I5] normalizar no meio (depois de separar, com a conferencia aberta): o livro nao muda, a conferencia conclui sem ajuste, a entrega fecha ENTREGUE', async () => {
    const m = await legado({ categoria: 'CAT-E96T5-I5' });
    const { R, I } = await aprovada(m, 1);
    assert.strictEqual(await statusReq(R), 'TOTALMENTE_RESERVADA');
    for (const q of [0.7, 0.2, 0.1]) ok(await separar(R, I, q), `separar ${q}`);
    assert.strictEqual((await colunas(m)).quantidade_atual, TORTO, 'premissa: o fisico ainda e o legado torto');
    const conf = await como('ALMOX').post(`${API}/conferencias`, { categoria: 'CAT-E96T5-I5', tolerancia_percentual: 100 });
    ok(conf, 'abrir a conferencia');
    const ic = await dbGet(db, 'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?', [conf.body.id, m]);
    assert.ok(ic, 'o material entrou na conferencia');
    assert.strictEqual(ic.quantidade_sistema, TORTO, 'premissa: a conferencia abriu sobre o torto');
    ok(await como('ALMOX').put(`${API}/conferencias/${conf.body.id}/item/${ic.id}`, { quantidade_contada: 1 }), 'contar 1');
    const livro = () => dbGet(db, 'SELECT COUNT(*) n, SUM(quantidade) q, SUM(saldo_anterior) a, SUM(saldo_posterior) p FROM movimentacoes_almoxarifado');
    const antes = await livro();
    const res = await L.normalizar(db, { aplicar: true });
    assert.strictEqual(res.aplicado, true);
    assert.ok(res.porColuna.find((c) => c.tabela === 'materiais_almoxarifado' && c.coluna === 'quantidade_atual').linhas >= 1, JSON.stringify(res.porColuna));
    assert.deepStrictEqual(await livro(), antes, 'o livro mudou com a normalizacao');
    assert.strictEqual((await colunas(m)).quantidade_atual, 1);
    const n0 = (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
    ok(await como('GESTOR').put(`${API}/conferencias/${conf.body.id}/concluir`, { aplicar_ajustes: true, justificativa_ajuste: 'contagem da etapa 96 T5' }), 'concluir');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n, n0, 'ajuste fantasma');
    for (const q of [0.7, 0.2, 0.1]) { ok(await entregar(R, I, q), `entregar ${q}`); somar(m, -q); }
    assert.strictEqual(await statusReq(R), 'ENTREGUE');
    await fecharMaterial(m, 'I5', { inicio: 1 });
  });

  // ═══════════════════ I6 — o legado em varias colunas, a CLI e a A47 do banco inteiro ═══════════════════
  await test('[96 I6] legado no fisico, na linha e na reserva atravessa transferencia, reserva e saida e sai limpo sozinho', async () => {
    const m = await legado();
    const A = await loc(); const B = await loc();
    await dbRun(db, "UPDATE estoque_saldo_almoxarifado SET localizacao_id = ? WHERE material_id = ?", [A, m]); // a linha legada no endereco A
    // uma reserva manual antiga de 0,1 + 0,2 (0.30000000000000004 na reserva e no material)
    const rv = await reservar(m, 0.3);
    assert.strictEqual(rv.status, 201, JSON.stringify(rv.body));
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade = ? WHERE id = ?', [0.30000000000000004, rv.body.id]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = ?, quantidade_atual = ? WHERE id = ?', [0.30000000000000004, TORTO, m]);
    assert.ok((await a47(m)).length >= 4, `premissa: o legado em quatro colunas: ${JSON.stringify(await a47(m))}`);
    await movOk(m, 'TRANSFERENCIA', 1, { localizacao_origem_id: A, localizacao_destino_id: B });
    assert.deepStrictEqual([await linha(m, A), await linha(m, B)], [0, 1]);
    await movOk(m, 'SAIDA', 0.7, { localizacao_origem_id: B }); // o livre e 1 - 0,3
    ok(await liberar(rv.body.id), 'liberar a reserva torta');
    await movOk(m, 'SAIDA', 0.3, { localizacao_origem_id: B });
    await fecharMaterial(m, 'I6', { inicio: 1 });
  });

  await test('[96 I6] o legado parado: a CLI lista sem gravar, com --aplicar limpa a copia sem tocar o livro; o servico limpa o banco; a A47 do banco inteiro fica vazia', async () => {
    const p = await legado();
    const tortos = await L.listarTortos(db);
    assert.ok(tortos.length >= 2, `premissa: o legado parado na A47: ${JSON.stringify(tortos)}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e96t5-'));
    try {
      const arquivo = path.join(tmp, 'database.sqlite');
      await dbRun(db, `VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);
      const cli = (args = []) => spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: path.join(__dirname, '..', '..'), env: { ...process.env, CRM_DATA_DIR: tmp }, encoding: 'utf8', timeout: 60000,
      });
      const abrir = () => new Promise((res, rej) => { const d = new sqlite3.Database(arquivo, sqlite3.OPEN_READWRITE, (e) => (e ? rej(e) : res(d))); });
      const fechar = (d) => new Promise((res, rej) => d.close((e) => (e ? rej(e) : res())));
      const livroSql = 'SELECT COUNT(*) n, SUM(quantidade) q, SUM(saldo_anterior) a, SUM(saldo_posterior) p FROM movimentacoes_almoxarifado';
      const livroAntes = await dbGet(db, livroSql);
      const lista = cli();
      assert.strictEqual(lista.status, 0, lista.stderr);
      assert.ok(lista.stdout.includes('Nada gravado. Rode com --aplicar para normalizar.'), lista.stdout);
      let c = await abrir();
      try { assert.strictEqual((await L.listarTortos(c)).length, tortos.length, 'a CLI gravou sem --aplicar'); } finally { await fechar(c); }
      const aplica = cli(['--aplicar']);
      assert.strictEqual(aplica.status, 0, aplica.stderr);
      assert.ok(aplica.stdout.includes('Normalizado.'), aplica.stdout);
      c = await abrir();
      try {
        assert.deepStrictEqual(await L.listarTortos(c), [], 'a copia continuou torta');
        assert.deepStrictEqual(await dbGet(c, livroSql), livroAntes, 'a CLI mexeu no livro');
      } finally { await fechar(c); }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    await L.normalizar(db, { aplicar: true });
    assert.deepStrictEqual(await L.listarTortos(db), [], 'a A47 do banco inteiro');
    await movOk(p, 'SAIDA', 1);
    await fecharMaterial(p, 'I6 (parado)', { inicio: 1 });
    assert.deepStrictEqual(await L.listarTortos(db), [], 'a A47 do banco inteiro no fim');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
