/**
 * Etapa 121 (C252; B784) — a Auditoria de um ato ja gravado nao derruba o ato: recebimento, compras, nao conformidade,
 * reserva, assinatura de entrega e fila de notificacoes (RN-11), e a guarda da conferencia que fica fatal (RN-14).
 *
 * Medido pela sonda e121m-C: com a Auditoria falhando DEPOIS do ato, a resposta era 500 e a tela lia "nada aconteceu" — o
 * recebimento repetido virava dois documentos, a nota processada deixava a requisicao que esperava SEM a reserva (e repetir
 * dava "Nota ja processada"), a assinatura ficava no banco com o arquivo apagado do disco pelo catch da rota, o reenvio nao
 * enviava, e o verificar-minimos parava no primeiro material. Nos lacos ja contidos pelo chamador, a falha no 1o item pulava
 * os seguintes. Em cada porta aqui: com a Auditoria DAQUELA porta falhando, o status de sempre, o ato gravado UMA vez e o que
 * vem depois rodando.
 *
 * Executar: cd server && node tests/api/auditoriaDoAtoRecebimento.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const OUTRO = { id: 2, nome: 'Outro Teste', role: 'admin', is_superadmin: 1, email: 'outro@test.com' };
const API = '/api/almoxarifado';

(async () => {
  const { app, db, setUser, uploadsAlmoxDir, close } = await createTestApp({ user: SUPER });

  /** O INSERT da Auditoria com `entidade`/`acao` falha uma vez (a primeira que casar). */
  async function comAuditoriaFalhando(entidade, acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    let res;
    try { res = await fn(); } finally { db.run = original; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return res;
  }
  /** O mesmo, capturando o console.warn (o log do helper). */
  async function comAvisos(fn) {
    const avisos = []; const warn = console.warn; console.warn = (...a) => avisos.push(a.join(' '));
    try { return { r: await fn(), avisos }; } finally { console.warn = warn; }
  }
  const linhas = async (entidade, acao, id) => (await dbGet(db,
    `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = ? AND acao = ?${id != null ? ' AND entidade_id = ?' : ''}`,
    id != null ? [entidade, acao, id] : [entidade, acao])).n;

  const forn = (await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor ADAR121','12100000000121','ativo')")).lastID;
  let seq = 0;
  const material = async (extra = {}) => {
    seq += 1;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, fornecedor_id) VALUES (?, ?, 'PC', 0, 0, 10, 1, ?)`, [`ADAR121-${seq}`, `ADAR121-${seq}`, forn])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return id;
  };
  /** Recebimento gravado direto, com os itens [{ material_id, q, pedido_item_id? }]. */
  const novaNota = async (itens, { status = 'EM_ENTRADA_NF', pedidoId = null } = {}) => {
    seq += 1;
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome,
      data_emissao_nf, data_entrada_nf, valor_total_nota, pedido_compra_id)
      VALUES (?, ?, ?, 'F-ADAR121', '2026-09-01', '2026-09-02', 10, ?)`, [`REC-ADAR121-${seq}`, status, `NF-ADAR121-${seq}`, pedidoId])).lastID;
    for (const it of itens) {
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, pedido_item_id,
        quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?,?)`, [r, it.material_id, it.pedido_item_id || null, it.q, it.q]);
    }
    return r;
  };
  /** Pedido de compra pela porta real; devolve o id e a linha de cada material. */
  async function novoPedido(itens) {
    setUser(SUPER);
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status: 'pendente',
      itens: itens.map((i) => ({ material_id: i.material_id, quantidade: i.q, valor_unitario: 1 })) });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const ls = await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [r.body.id]);
    return { id: r.body.id, linhaDe: (m) => ls.find((l) => l.material_id === m).id };
  }
  /** Solicitacao PENDENTE vinculada ao pedido pela porta real. */
  async function solicitacaoVinculada(materialId, q, pedidoId) {
    const s = (await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status)
      VALUES (?, ?, 'MANUAL', 'PENDENTE')`, [materialId, q])).lastID;
    const r = await request(app).post(`${API}/compras/solicitacoes/${s}/vincular-pedido`).send({ pedido_compra_id: pedidoId });
    assert.strictEqual(r.status, 200, `fixture: vincular ${JSON.stringify(r.body)}`);
    return s;
  }
  /** Requisicao de `q` aprovada sem estoque (AGUARDANDO_ESTOQUE). */
  async function requisicaoEsperando(materialId, q) {
    setUser(OUTRO);
    const rq = await request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS-ADAR121', itens: [{ material_id: materialId, quantidade: q }] });
    setUser(SUPER);
    assert.ok([200, 201].includes(rq.status), `fixture: requisicao ${rq.status} ${JSON.stringify(rq.body)}`);
    const id = rq.body.id || rq.body.requisicao?.id;
    const ap = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `fixture: aprovar ${JSON.stringify(ap.body)}`);
    const st = (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
    assert.strictEqual(st, 'AGUARDANDO_ESTOQUE', 'fixture: a requisicao tinha de esperar estoque');
    return id;
  }
  const statusRec = async (id) => (await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).status;

  console.log('\n=== Etapa 121: a Auditoria do ato (C252) — recebimento, compras, NC, reserva, assinatura, fila ===\n');

  // ── criarRecebimento: as tres Auditorias da criacao ──
  await test('[RN-11a] criar recebimento com a Auditoria do excedente autorizado falhando -> 201, UM documento, a CRIACAO auditada', async () => {
    const m = await material();
    const antes = (await dbGet(db, "SELECT COUNT(*) n FROM recebimentos_material_almoxarifado WHERE fornecedor_nome = 'F-ADAR121a'")).n;
    const r = await comAuditoriaFalhando('recebimento_item', 'EXCEDENTE_AUTORIZADO', () => request(app).post(`${API}/recebimentos`)
      .send({ tipo_recebimento: 'NOTA_FISCAL', fornecedor_nome: 'F-ADAR121a', autorizar_excedente: true,
        itens: [{ material_id: m, quantidade: 2, quantidade_recebida: 3 }] }));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    const depois = (await dbGet(db, "SELECT COUNT(*) n FROM recebimentos_material_almoxarifado WHERE fornecedor_nome = 'F-ADAR121a'")).n;
    assert.strictEqual(depois - antes, 1, 'um documento so');
    assert.strictEqual(r.body.status, 'RECEBIDO');
    assert.strictEqual(await linhas('recebimento', 'CRIACAO', r.body.id), 1, 'a CRIACAO (o que vem depois) nao rodou');
  });

  await test('[RN-11b] criar recebimento contra o pedido com a Auditoria do excedente do saldo falhando -> 201, UM documento', async () => {
    const m = await material();
    const p = await novoPedido([{ material_id: m, q: 10 }]);
    const corpo = { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: p.id, autorizar_excedente: true,
      itens: [{ material_id: m, pedido_item_id: p.linhaDe(m), quantidade: 15, quantidade_recebida: 15 }] };
    const r = await comAuditoriaFalhando('recebimento_item', 'EXCEDENTE_AUTORIZADO',
      () => request(app).post(`${API}/recebimentos`).send(corpo));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM recebimentos_material_almoxarifado WHERE pedido_compra_id = ?', [p.id])).n, 1);
    assert.strictEqual(await linhas('recebimento', 'CRIACAO', r.body.id), 1, 'a CRIACAO (o que vem depois) nao rodou');
  });

  await test('[RN-11c] criar recebimento com a Auditoria da CRIACAO falhando -> 201 e UM documento (repetir nao duplica a toa)', async () => {
    const m = await material();
    const r = await comAuditoriaFalhando('recebimento', 'CRIACAO', () => request(app).post(`${API}/recebimentos`)
      .send({ tipo_recebimento: 'NOTA_FISCAL', fornecedor_nome: 'F-ADAR121c', itens: [{ material_id: m, quantidade: 2 }] }));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(r.body.id && r.body.numero, JSON.stringify(r.body));
    assert.strictEqual((await dbGet(db, "SELECT COUNT(*) n FROM recebimentos_material_almoxarifado WHERE fornecedor_nome = 'F-ADAR121c'")).n, 1);
  });

  // ── workflow ──
  await test('[RN-11d] workflow iniciar_conferencia com a Auditoria falhando -> 200 e EM_CONFERENCIA', async () => {
    const m = await material();
    const rec = await novaNota([{ material_id: m, q: 3 }], { status: 'RECEBIDO' });
    const r = await comAuditoriaFalhando('recebimento', 'INICIAR_CONFERENCIA',
      () => request(app).post(`${API}/recebimentos/${rec}/workflow`).send({ acao: 'iniciar_conferencia' }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'EM_CONFERENCIA');
    assert.strictEqual(await statusRec(rec), 'EM_CONFERENCIA');
  });

  // ── processar a nota: o mais grave ──
  await test('[RN-11e] processar a nota com a Auditoria PROCESSAR_NOTA falhando -> 200, a reserva de quem esperava NASCE e a solicitacao fecha', async () => {
    const m = await material();
    const R = await requisicaoEsperando(m, 4);
    const p = await novoPedido([{ material_id: m, q: 4 }]);
    const s = await solicitacaoVinculada(m, 4, p.id);
    const rec = await novaNota([{ material_id: m, q: 4, pedido_item_id: p.linhaDe(m) }], { pedidoId: p.id });
    const r = await comAuditoriaFalhando('recebimento', 'PROCESSAR_NOTA',
      () => request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, 'PROCESSADO');
    assert.strictEqual(await statusRec(rec), 'PROCESSADO');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 4, 'entrou uma vez so');
    const reservas = (await dbGet(db, "SELECT COUNT(*) n FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [R])).n;
    assert.strictEqual(reservas, 1, 'a reserva da requisicao que esperava nao nasceu');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R])).status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [s])).status, 'RECEBIDA',
      'a solicitacao do pedido nao fechou');
  });

  // ── compras ──
  await test('[RN-11f] cancelar solicitacao com a Auditoria falhando -> 200 e CANCELADA', async () => {
    const m = await material();
    const s = (await dbRun(db, "INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo) VALUES (?, 5, 'MANUAL')", [m])).lastID;
    const r = await comAuditoriaFalhando('solicitacao_compra', 'CANCELAMENTO',
      () => request(app).post(`${API}/compras/solicitacoes/${s}/cancelar`).send({ motivo: 'teste 121' }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { success: true, status: 'CANCELADA' });
    assert.strictEqual((await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [s])).status, 'CANCELADA');
  });

  await test('[RN-11g] verificar minimos com dois materiais e a Auditoria do 1o falhando -> 200 e os DOIS ganham solicitacao', async () => {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 0');
    const a = await material({ quantidade_minima: 5, quantidade_maxima: 10 });
    const b = await material({ quantidade_minima: 5, quantidade_maxima: 10 });
    const r = await comAuditoriaFalhando('solicitacao_compra', 'CRIAR',
      () => request(app).post(`${API}/compras/verificar-minimos`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    for (const m of [a, b]) {
      assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [m])).n, 1,
        `material ${m} sem solicitacao (ou duplicada)`);
    }
    assert.strictEqual(r.body.criadas.length, 2, JSON.stringify(r.body));
  });

  await test('[RN-11h] gerar da sugestao com a Auditoria do 1o falhando -> 200, os DOIS criados e o resumo enfileirado', async () => {
    await dbRun(db, "INSERT OR REPLACE INTO configuracoes_almoxarifado (chave, valor) VALUES ('notificacoes_dest_compras', 'compras121@test.com')");
    const a = await material({ quantidade_minima: 5, quantidade_maxima: 20 });
    const b = await material({ quantidade_minima: 5, quantidade_maxima: 20 });
    const filaAntes = (await dbGet(db, "SELECT COUNT(*) n FROM fila_notificacoes_almoxarifado WHERE evento = 'SOLICITACAO_COMPRA'")).n;
    const r = await comAuditoriaFalhando('solicitacao_compra', 'CRIAR',
      () => request(app).post(`${API}/reposicao/gerar-solicitacoes`).send({ material_ids: [a, b] }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.criadas.length, 2, JSON.stringify(r.body));
    for (const m of [a, b]) {
      assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM solicitacoes_compra_almoxarifado WHERE material_id = ?', [m])).n, 1);
    }
    const filaDepois = (await dbGet(db, "SELECT COUNT(*) n FROM fila_notificacoes_almoxarifado WHERE evento = 'SOLICITACAO_COMPRA'")).n;
    assert.strictEqual(filaDepois - filaAntes, 1, 'o e-mail de resumo nao foi enfileirado');
  });

  // ── nao conformidade manual ──
  await test('[RN-11i] abrir NC manual com a Auditoria falhando -> 201 e UMA NC', async () => {
    const m = await material();
    const rec = await novaNota([{ material_id: m, q: 3 }], { status: 'RECEBIDO' });
    const item = (await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec])).id;
    const r = await comAuditoriaFalhando('nao_conformidade', 'NC_ABERTA', () => request(app).post(`${API}/nao-conformidades`)
      .send({ origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM', referencia_id: item, tipo: 'QUANTIDADE', descricao: 'teste 121' }));
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await dbGet(db,
      "SELECT COUNT(*) n FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?", [item])).n, 1);
  });

  // ── reserva ──
  await test('[RN-11j] transferir reserva com a Auditoria falhando -> 200 e a reserva no destino', async () => {
    const m = await material({ quantidade_atual: 10, quantidade_reservada: 2 });
    const rid = (await dbRun(db, "INSERT INTO reservas_material_almoxarifado (material_id, quantidade, status, os_referencia) VALUES (?, 2, 'ATIVA', 'OS-A')", [m])).lastID;
    const r = await comAuditoriaFalhando('reserva', 'TRANSFERENCIA',
      () => request(app).put(`${API}/reservas/${rid}/transferir`).send({ os_referencia: 'OS-B' }));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.os_referencia, 'OS-B', JSON.stringify(r.body));
  });

  // ── assinatura de entrega ──
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const assinar = async (sufixo) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, status, solicitante_id, solicitante_nome)
      VALUES (?, 'ENTREGUE', 1, 'Super')`, [`REQ-ADAR121-${sufixo}`])).lastID;
    const go = () => request(app).post(`${API}/requisicoes/${R}/assinatura-entrega`).field('recebedor_nome', 'Fulano')
      .attach('assinatura', png, { filename: 'a.png', contentType: 'image/png' });
    return { R, go };
  };
  const arquivosDa = async (R) => (await dbAll(db, 'SELECT arquivo FROM assinaturas_entrega_almoxarifado WHERE requisicao_id = ?', [R]))
    .map((x) => fs.existsSync(path.join(uploadsAlmoxDir, x.arquivo)));

  await test('[RN-11k] assinatura de entrega com a Auditoria falhando -> 201, UMA linha e o arquivo continua no disco (controle acha o arquivo)', async () => {
    // Metade positiva: sem falha o arquivo e achado no caminho procurado — o "nao esta no disco" seria real.
    const c = await assinar('ctl');
    const rc = await c.go();
    assert.strictEqual(rc.status, 201, JSON.stringify(rc.body));
    assert.deepStrictEqual(await arquivosDa(c.R), [true], 'controle: o caminho procurado esta errado');
    const f = await assinar('falha');
    const r = await comAuditoriaFalhando('requisicao', 'ASSINATURA_ENTREGA', f.go);
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(await arquivosDa(f.R), [true], 'a linha ficou sem o arquivo no disco');
  });

  // ── fila de notificacoes ──
  await test('[RN-11l] reenviar notificacao com a Auditoria falhando -> 200 e o envio na hora roda (igual ao controle)', async () => {
    const nova = async (k) => (await dbRun(db, `INSERT INTO fila_notificacoes_almoxarifado (evento, destinatarios, assunto, corpo_texto,
      status, tentativas, hash_dedupe) VALUES ('TESTE', '["x@y.com"]', 'a', 'b', 'FALHA', 5, ?)`, [`adar121-${k}`])).lastID;
    const linha = (id) => dbGet(db, 'SELECT status, tentativas, ultimo_erro IS NULL AS sem_erro FROM fila_notificacoes_almoxarifado WHERE id = ?', [id]);
    const c = await nova('ctl');
    const rc = await request(app).post(`${API}/notificacoes/${c}/reenviar`).send({});
    assert.strictEqual(rc.status, 200, JSON.stringify(rc.body));
    const esperado = await linha(c);
    assert.ok(!(esperado.status === 'PENDENTE' && esperado.tentativas === 0), `controle: o envio na hora nao rodou ${JSON.stringify(esperado)}`);
    const n = await nova('falha');
    const r = await comAuditoriaFalhando('notificacao', 'REENVIAR', () => request(app).post(`${API}/notificacoes/${n}/reenviar`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, rc.body);
    assert.deepStrictEqual({ ...(await linha(n)) }, { ...esperado }, 'o envio na hora nao rodou');
  });

  // ── os tres lacos ──
  await test('[RN-11m] laco RECEBIDA: a Auditoria da 1a solicitacao falhando nao pula a do 2o material', async () => {
    const a = await material(); const b = await material();
    const p = await novoPedido([{ material_id: a, q: 2 }, { material_id: b, q: 2 }]);
    const sa = await solicitacaoVinculada(a, 2, p.id);
    const sb = await solicitacaoVinculada(b, 2, p.id);
    const rec = await novaNota([{ material_id: a, q: 2, pedido_item_id: p.linhaDe(a) }, { material_id: b, q: 2, pedido_item_id: p.linhaDe(b) }],
      { pedidoId: p.id });
    const r = await comAuditoriaFalhando('solicitacao_compra', 'RECEBIDA',
      () => request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const st = await dbAll(db, 'SELECT id, status FROM solicitacoes_compra_almoxarifado WHERE id IN (?, ?) ORDER BY id', [sa, sb]);
    assert.deepStrictEqual(st.map((x) => x.status), ['RECEBIDA', 'RECEBIDA'], JSON.stringify(st));
    assert.strictEqual((await linhas('solicitacao_compra', 'RECEBIDA', sa)) + (await linhas('solicitacao_compra', 'RECEBIDA', sb)), 1,
      'a Auditoria da que nao falhou tinha de estar la');
  });

  await test('[RN-11n] laco STATUS_AUTOMATICO_RECEBIDO: a Auditoria do 1o pedido falhando nao pula o 2o pedido', async () => {
    const a = await material(); const b = await material();
    const p1 = await novoPedido([{ material_id: a, q: 2 }]);
    const p2 = await novoPedido([{ material_id: b, q: 2 }]);
    const rec = await novaNota([{ material_id: a, q: 2, pedido_item_id: p1.linhaDe(a) }, { material_id: b, q: 2, pedido_item_id: p2.linhaDe(b) }],
      { pedidoId: p1.id });
    const r = await comAuditoriaFalhando('pedido_compra', 'STATUS_AUTOMATICO_RECEBIDO',
      () => request(app).post(`${API}/recebimentos/${rec}/processar`).send({}));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const st = await dbAll(db, 'SELECT id, status FROM pedidos_compra WHERE id IN (?, ?) ORDER BY id', [p1.id, p2.id]);
    assert.deepStrictEqual(st.map((x) => x.status), ['recebido', 'recebido'], JSON.stringify(st));
  });

  await test('[RN-11o] laco NC_CANCELADA automatica: a Auditoria da 1a falhando cancela as duas e o log e o do helper, nao o do gancho', async () => {
    const a = await material(); const b = await material();
    const rec = await novaNota([{ material_id: a, q: 3 }, { material_id: b, q: 3 }], { status: 'RECEBIDO' });
    const itens = await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [rec]);
    const conferir = (q) => request(app).put(`${API}/recebimentos/${rec}/conferir`)
      .send({ itens: itens.map((i) => ({ id: i.id, quantidade_recebida: q })) });
    const r1 = await conferir(1);
    assert.strictEqual(r1.status, 200, `fixture: conferir divergente ${JSON.stringify(r1.body)}`);
    const ncs = async () => dbAll(db, `SELECT status FROM nao_conformidades_almoxarifado WHERE referencia_tipo = 'RECEBIMENTO_ITEM'
      AND referencia_id IN (?, ?) ORDER BY referencia_id`, itens.map((i) => i.id));
    assert.deepStrictEqual((await ncs()).map((x) => x.status), ['ABERTA', 'ABERTA'], 'fixture: as NCs automaticas nao abriram');
    const { r, avisos } = await comAvisos(() => comAuditoriaFalhando('nao_conformidade', 'NC_CANCELADA', () => conferir(3)));
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual((await ncs()).map((x) => x.status), ['CANCELADA', 'CANCELADA']);
    assert.ok(!avisos.some((l) => l.includes('nao conformidade de quantidade falhou')),
      `a falha da Auditoria ainda sobe como falha do gancho: ${JSON.stringify(avisos)}`);
    assert.ok(avisos.some((l) => l.includes('[almoxarifado] auditoria do ato falhou (nao_conformidade')), JSON.stringify(avisos));
  });

  // ── RN-14: a conferencia ──
  // ⚠️ Etapa 122 (B791): este cenario dizia "fica fatal de proposito: ... -> 500 e nada gravado". Estava certo para o codigo da
  // 121, em que a trilha rodava ANTES do UPDATE (o 500 era a verdade). A 122 moveu a trilha para DEPOIS do UPDATE de cada item
  // (com dois excedentes e a 2a trilha falhando, o 500 deixava a 1a trilha sem o ato) — a razao do "fatal" caiu e a porta segue
  // a B784: o ato vale. Os cenarios novos estao em `excedenteDaConferenciaDepoisDoAto.api.test.js`.
  await test('[RN-14] a Auditoria do excedente na CONFERENCIA falhando -> 200, o status e o item gravados (desde a 122, depois do ato)', async () => {
    const m = await material();
    const rec = await novaNota([{ material_id: m, q: 2 }], { status: 'RECEBIDO' });
    const item = (await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec])).id;
    const r = await comAuditoriaFalhando('recebimento_item', 'EXCEDENTE_AUTORIZADO', () => request(app).put(`${API}/recebimentos/${rec}/conferir`)
      .send({ status: 'EM_CONFERENCIA', autorizar_excedente: true, itens: [{ id: item, quantidade_recebida: 5 }] }));
    assert.strictEqual(r.status, 200, `a Auditoria da conferencia ainda derruba o ato: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(await statusRec(rec), 'EM_CONFERENCIA');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_recebida q FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [item])).q, 5);
    assert.strictEqual(await linhas('recebimento_item', 'EXCEDENTE_AUTORIZADO', item), 0, 'a trilha que falhou apareceu');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
