/**
 * Etapa 93 (T6) — integracao: os gestos concorrentes na mesma requisicao cruzando as portas, pela rota e
 * pelo servico, com usuarios reais por header, cada jornada seguida ate o ultimo gesto.
 *
 * Os testes da T0-T5 (`requisicaoGestosConcorrentes`) provam cada par com a requisicao montada a mao
 * (reserva pelo motor, status por UPDATE). Aqui a requisicao nasce como na vida: S (sem perfil = PRODUCAO)
 * pede por `POST /api/requisicoes-material`, o saldo entra por movimentacao ENTRADA e o ADMIN aprova pela
 * rota (a aprovacao e quem reserva). ALMOX e ALMOX2 (ALMOXARIFE) separam, conferem, liberam, entregam e
 * colhem a assinatura; o ADMIN exclui e encerra.
 *
 *  A — dois almoxarifes, material comum, pela rota: separar x liberar, entregar x entregar -> ENTREGUE,
 *      assinatura, saldo, A44 vazia.
 *  B — critico: liberar x rodada 2 (a rodada espera e le PRONTA), entrega parcial, nova rodada, nova
 *      conferencia, entrega final -> ENTREGUE, A44 vazia.
 *  C — exclusao pelas DUAS rotas na mesma requisicao (a fila e do servico) e exclusao x entrega nos dois
 *      encaixes -> um estorno so, A44 (a)(c) vazias.
 *  D — pelo servico direto, sem rota, sem gancho, N=10: a trava vale para qualquer chamador.
 *  E — a 92 compoe: o cancelamento pelos outros modulos (fora da trava) na reivindicacao, aguardado, sem
 *      deadlock; e a PARCIALMENTE_ATENDIDA encerrada no meio da entrega nao volta a aberta.
 *  A44 — controle positivo: as cinco consultas ACHAM o estado que as corridas produziam (montado a mao) —
 *      sem isso "A44 vazia" nas jornadas seria um teste que nao sabe falhar.
 *
 * Tecnica (plano, "Tecnica dos testes de corrida"): o gancho no SQL DISPARA o gesto concorrente e NAO o
 * aguarda (deadlock com a trava); espera `esperandoNaRequisicao(R) === 1` e so entao emite o comando retido.
 * O gancho do cancelamento da 92 (fora da trava) e AGUARDADO, como na 92.
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa93-gestos-concorrentes-mesma-requisicao.md (T6).
 *
 * Executar: cd server && node tests/api/requisicaoGestosConcorrentesIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const trava = require('../../services/almoxarifado/travaPorRequisicao');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 93T6', role: 'admin', is_superadmin: 1, email: 'a93t6@t.com' },
  S: { id: 9361, nome: 'Solic 93T6', role: 'user', email: 's93t6@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9362, nome: 'Almox 93T6', role: 'user', email: 'x93t6@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9363, nome: 'Almox2 93T6', role: 'user', email: 'y93t6@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
// Literais congeladas (plano, Contrato).
const S1 = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';
const E0 = 'Requisição deve estar em separação, pronta para retirada ou parcialmente atendida';
const N0 = 'Requisição não encontrada';
const RE = {
  CLAIM: /SET\s+status\s*=\s*'EM_SEPARACAO'[^;]*WHERE\s+id\s*=\s*\?\s+AND\s+status\s+IN/,
  CAC: /SET\s+status\s*=\s*'EM_SEPARACAO'[\s\S]*conferido_por_id\s*=\s*NULL/,
  EXCL: /SET\s+ativo\s*=\s*0,\s*status\s*=\s*'CANCELADO'/,
  ENT: /SET\s+status\s*=\s*\?,\s*(data_entrega\s*=|updated_at\s*=\s*CURRENT_TIMESTAMP,\s*ultimo_lembrete_enviado\s*=\s*NULL\s+WHERE)/,
  ITEM_ENT: /UPDATE\s+itens_requisicao_almoxarifado\s+SET\s+quantidade_entregue\s*=/,
  LIB: /SET\s+status\s*=\s*'PRONTA_PARA_RETIRADA'/,
};
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

// A44 (plano, "Letra A") — o texto da consulta, sem mudar uma virgula; o teste filtra por requisicao por fora.
const A44 = {
  a: `SELECT rq.id, rq.numero, rq.status FROM requisicoes_almoxarifado rq
 WHERE COALESCE(rq.ativo, 1) = 0 AND rq.status <> 'CANCELADO' ORDER BY rq.id`,
  b: `SELECT rq.id, rq.numero, i.material_id, SUM(COALESCE(i.quantidade_entregue,0)) AS entregue_itens,
       (SELECT COALESCE(SUM(m.quantidade),0) FROM movimentacoes_almoxarifado m
         WHERE m.requisicao_id = rq.id AND m.material_id = i.material_id AND m.tipo = 'SAIDA'
           AND COALESCE(m.cancelado,0) = 0) AS saidas_livro
  FROM requisicoes_almoxarifado rq JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
 WHERE COALESCE(rq.ativo, 1) = 1
 GROUP BY rq.id, rq.numero, i.material_id
HAVING ABS(entregue_itens - saidas_livro) > 1e-9 ORDER BY rq.id`,
  c: `SELECT rq.id, rq.numero, m.material_id,
       SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade ELSE 0 END) AS saiu,
       SUM(CASE WHEN m.tipo = 'ENTRADA' AND m.motivo LIKE 'Estorno exclus%' THEN m.quantidade ELSE 0 END) AS estornado
  FROM requisicoes_almoxarifado rq JOIN movimentacoes_almoxarifado m ON m.requisicao_id = rq.id AND COALESCE(m.cancelado,0) = 0
 WHERE COALESCE(rq.ativo, 1) = 0
 GROUP BY rq.id, rq.numero, m.material_id
HAVING ABS(estornado - saiu) > 1e-9 ORDER BY rq.id`,
  d: `SELECT rq.id, rq.numero, rq.status FROM requisicoes_almoxarifado rq
 WHERE COALESCE(rq.ativo, 1) = 1 AND rq.status IN ('EM_SEPARACAO','PRONTA_PARA_RETIRADA','PARCIALMENTE_ATENDIDA')
   AND EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado i WHERE i.requisicao_id = rq.id)
   AND NOT EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado i WHERE i.requisicao_id = rq.id
                    AND COALESCE(i.quantidade_entregue,0) < i.quantidade_solicitada - 1e-9) ORDER BY rq.id`,
  e: `SELECT rq.id, rq.numero FROM requisicoes_almoxarifado rq
 WHERE COALESCE(rq.ativo, 1) = 1 AND rq.status = 'PRONTA_PARA_RETIRADA' AND rq.conferido_por_id IS NULL
   AND EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado i JOIN materiais_almoxarifado mt ON mt.id = i.material_id
                WHERE i.requisicao_id = rq.id AND mt.material_critico = 1
                  AND COALESCE(i.quantidade_separada,0) - COALESCE(i.quantidade_entregue,0) > 1e-9) ORDER BY rq.id`,
};

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);
const esperarFila = async (R, ms = 3000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    if (trava.esperandoNaRequisicao(R) === 1) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 2));
  }
  return false;
};

(async () => {
  console.log('\n=== Etapa 93 (T6): integracao — gestos concorrentes na mesma requisicao, rota e servico ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (sem header: ADMIN) — molde da 92.
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  // ── gancho no SQL ──
  // fila: dispara o gesto SEM aguardar, espera ele entrar na fila da trava, emite o comando retido.
  // aguardar: o molde da 92 (gesto ate a resposta, depois o comando) — so para quem NAO disputa a trava.
  const origRun = db.run.bind(db);
  let ganchos = [];
  db.run = function (sql, ...rest) {
    const s = String(sql);
    for (const g of ganchos) {
      if (g.armado && g.re.test(s)) {
        g.armado = false; g.disparos++;
        if (g.aguardar) {
          g.promessa = comPrazo(Promise.resolve().then(g.fn), 5000, 'gesto aguardado no gancho')
            .then((r) => { g.resposta = r; }, (e) => { g.erro = e; })
            .then(() => origRun(sql, ...rest));
          return this;
        }
        g.promessa = Promise.resolve().then(g.fn).then((r) => { g.resposta = r; }, (e) => { g.erro = e; });
        esperarFila(g.R).then((ok) => { g.entrouNaFila = ok; origRun(sql, ...rest); });
        return this;
      }
    }
    return origRun(sql, ...rest);
  };
  const armarFila = (re, R, fn) => { const g = { re, R, fn, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const armarAguardando = (re, fn) => { const g = { re, fn, aguardar: true, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };
  /** O gancho disparou 1 vez e o gesto respondeu (sem lancar). */
  const afirmarGancho = async (g, rotulo) => {
    await g.promessa;
    assert.strictEqual(g.disparos, 1, `${rotulo}: o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, `${rotulo}: o gesto do gancho lancou: ${g.erro && g.erro.message}`);
    assert.ok(g.resposta, `${rotulo}: o gesto do gancho nao respondeu`);
  };
  /** "O segundo entrou na fila" — afirmado no FIM de cada passo, para o desfecho cair primeiro. */
  const afirmarFila = (g, rotulo) => {
    assert.strictEqual(g.entrouNaFila, true, `${rotulo}: o segundo gesto NAO entrou na fila da trava`);
  };

  // ── fixtures pela porta de sempre ──
  const API = '/api/almoxarifado';
  const material = async (q, { critico = false } = {}) => {
    const c = `E93T6-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, custo_unitario, ativo, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 0, 10, 1, ?)`, [c, `Mat ${c}`, critico ? 1 : 0])).lastID;
    const e = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: id, tipo: 'ENTRADA', quantidade: q, motivo: 'Ajuste', justificativa: 'e93t6 saldo' });
    assert.strictEqual(e.status, 201, `ENTRADA: ${e.status} ${JSON.stringify(e.body)}`);
    return id;
  };
  /** S pede, o ADMIN aprova pela rota (a aprovacao reserva) -> TOTALMENTE_RESERVADA. */
  const pedirEAprovar = async (m, pede) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-93T6', itens: [{ material_id: m, quantidade: pede }],
    });
    assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
    const R = cr.body.id;
    const row0 = await dbGet(db, 'SELECT solicitante_id, status FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(Number(row0.solicitante_id), USERS.S.id, 'quem pediu foi S');
    assert.strictEqual(row0.status, 'PENDENTE');
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`);
    assert.strictEqual(ap.status, 200, `aprovar: ${ap.status} ${JSON.stringify(ap.body)}`);
    const row = await dbGet(db, 'SELECT status, aprovador_id FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(row.status, 'TOTALMENTE_RESERVADA', `aprovada: ${row.status}`);
    assert.strictEqual(Number(row.aprovador_id), USERS.ADMIN.id, 'quem aprovou foi o ADMIN');
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    const rs = await dbAll(db, 'SELECT id, status FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [R]);
    assert.strictEqual(rs.length, 1, `reservas da aprovacao: ${JSON.stringify(rs)}`);
    assert.strictEqual(rs[0].status, 'ATIVA');
    return { m, R, item, rid: rs[0].id };
  };
  const separar = (k, R, item, q) => como(k).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: [{ item_id: item, quantidade_separada: q }],
  });
  const conferir = (k, R) => como(k).put(`${API}/requisicoes/${R}/conferir-separacao`);
  const liberar = (k, R) => como(k).put(`${API}/requisicoes/${R}/liberar-retirada`);
  const entregar = (k, R, item, q) => como(k).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: [{ item_id: item, quantidade_atendida: q }],
  });
  const excluirAlmox = (k, R) => como(k).del(`${API}/requisicoes/${R}`, { justificativa: 'teste 93 T6' });
  const excluirOutros = (k, R) => como(k).del(`/api/requisicoes-material/${R}`, { justificativa: 'teste 93 T6' });
  const cancelarOutros = (k, R) => como(k).put(`/api/requisicoes-material/${R}/cancelar`);
  const encerrar = (k, R) => como(k).put(`${API}/requisicoes/${R}/encerrar`, {});
  const assinar = (k, R, recebedor) => request(app).post(`${API}/requisicoes/${R}/assinatura-entrega`)
    .set('x-teste-usuario', k).field('recebedor_nome', recebedor).attach('assinatura', PNG_1PX, 'assinatura.png').then((x) => x);

  const foto = async ({ m, R, item, rid }) => {
    const rq = await dbGet(db, `SELECT status, COALESCE(ativo,1) ativo, conferido_por_id, data_entrega
      FROM requisicoes_almoxarifado WHERE id = ?`, [R]);
    const it = await dbGet(db, 'SELECT quantidade_separada sep, quantidade_entregue ent FROM itens_requisicao_almoxarifado WHERE id = ?', [item]);
    const rv = await dbGet(db, 'SELECT status, quantidade_utilizada u FROM reservas_material_almoxarifado WHERE id = ?', [rid]);
    const mt = await dbGet(db, 'SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r FROM materiais_almoxarifado WHERE id = ?', [m]);
    const rods = await dbAll(db, 'SELECT * FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
    const movs = await dbAll(db, `SELECT tipo, quantidade, motivo, usuario_id FROM movimentacoes_almoxarifado
      WHERE requisicao_id = ? AND COALESCE(cancelado,0) = 0 ORDER BY id`, [R]);
    const trilha = await dbAll(db, `SELECT acao, usuario_id, dados_anteriores FROM auditoria_log_almoxarifado
      WHERE entidade = 'requisicao' AND entidade_id = ? ORDER BY id`, [R]);
    return {
      status: rq.status, ativo: Number(rq.ativo), conferido: rq.conferido_por_id, dataEntrega: !!rq.data_entrega,
      sep: Number(it.sep || 0), ent: Number(it.ent || 0), reserva: rv.status, u: Number(rv.u || 0),
      q: Number(mt.q), r: Number(mt.r), rodadas: rods,
      saidas: movs.filter((x) => x.tipo === 'SAIDA').reduce((s, x) => s + Number(x.quantidade), 0),
      estornos: movs.filter((x) => x.tipo === 'ENTRADA' && /^Estorno exclus/.test(x.motivo || '')),
      movs: movs.filter((x) => x.tipo === 'SAIDA' || x.tipo === 'ENTRADA').map((x) => `${x.tipo}:${Number(x.quantidade)}`).join(','),
      trilha, acoes: trilha.map((x) => x.acao),
    };
  };
  /** Consulta de saldo pela rota (o ultimo gesto de quem confere o estoque). */
  const saldo = async (m) => {
    const r = await como('ALMOX').get(`${API}/materiais/${m}`);
    assert.strictEqual(r.status, 200, `GET material: ${r.status} ${JSON.stringify(r.body)}`);
    return { q: Number(r.body.quantidade_atual), r: Number(r.body.quantidade_reservada || 0) };
  };
  /** As consultas da A44 que devem estar vazias para R (o texto da A44, filtrado por fora). */
  const a44Para = async (R, letras = ['a', 'b', 'c', 'd', 'e']) => {
    const achou = {};
    for (const l of letras) {
      // eslint-disable-next-line no-await-in-loop
      const linhas = await dbAll(db, `SELECT * FROM (${A44[l]}) WHERE id = ?`, [R]);
      if (linhas.length) achou[l] = linhas;
    }
    return achou;
  };
  const afirmarA44Vazia = async (R, letras, rotulo) => {
    const achou = await a44Para(R, letras);
    assert.deepStrictEqual(achou, {}, `${rotulo}: A44 achou R${R}: ${JSON.stringify(achou)}`);
  };
  const ordemDe = (acoes, lista) => acoes.filter((a) => lista.includes(a)).join(',');

  // ══════════════ Jornada A — dois almoxarifes, material comum, pela rota ══════════════
  await test('[93 T6 A] S pede 4, ADMIN aprova; ALMOX separa 4 e no compare-and-clear ALMOX2 libera (espera) -> PRONTA; ALMOX2 entrega 2 e no UPDATE do item ALMOX entrega 2 (espera) -> ENTREGUE, entregue 4 = saidas 4, reserva CONSUMIDA; assinatura 201; saldo q=0 r=0; A44 vazia', async () => {
    desarmar();
    const x = await pedirEAprovar(await material(4), 4);
    // 1. separar x liberar
    const gL = armarFila(RE.CAC, x.R, () => liberar('ALMOX2', x.R));
    const sep = await comPrazo(separar('ALMOX', x.R, x.item, 4), 10000, 'separacao');
    await afirmarGancho(gL, 'A1');
    desarmar();
    assert.strictEqual(sep.status, 200, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.status, 'EM_SEPARACAO');
    assert.strictEqual(gL.resposta.status, 200, `liberar: ${gL.resposta.status} ${JSON.stringify(gL.resposta.body)}`);
    let f = await foto(x);
    assert.strictEqual(f.status, 'PRONTA_PARA_RETIRADA', `status ${f.status} (a liberacao sumiu sob a rodada)`);
    assert.strictEqual(ordemDe(f.acoes, ['SEPARACAO', 'LIBERACAO_RETIRADA']), 'SEPARACAO,LIBERACAO_RETIRADA');
    assert.strictEqual(Number(f.rodadas[0].usuario_id), USERS.ALMOX.id, 'a rodada e de ALMOX');
    assert.strictEqual(Number(f.trilha.find((t) => t.acao === 'LIBERACAO_RETIRADA').usuario_id), USERS.ALMOX2.id, 'a liberacao e de ALMOX2');
    afirmarFila(gL, 'A1');
    // 2. entregar x entregar (a 4e / C156)
    const gE = armarFila(RE.ITEM_ENT, x.R, () => entregar('ALMOX', x.R, x.item, 2));
    const e1 = await comPrazo(entregar('ALMOX2', x.R, x.item, 2), 10000, 'primeira entrega');
    await afirmarGancho(gE, 'A2');
    desarmar();
    assert.strictEqual(e1.status, 200, `primeira: ${e1.status} ${JSON.stringify(e1.body)}`);
    assert.strictEqual(e1.body.status, 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual(gE.resposta.status, 200, `segunda: ${gE.resposta.status} ${JSON.stringify(gE.resposta.body)}`);
    assert.strictEqual(gE.resposta.body.status, 'ENTREGUE', 'a segunda le o estado novo e completa');
    f = await foto(x);
    assert.strictEqual(f.ent, 4, `quantidade_entregue ${f.ent} para saidas ${f.saidas}`);
    assert.strictEqual(f.saidas, 4);
    assert.strictEqual(f.status, 'ENTREGUE', `status ${f.status}`);
    assert.ok(f.dataEntrega, 'data_entrega gravada');
    assert.strictEqual(f.reserva, 'CONSUMIDA'); assert.strictEqual(f.u, 4);
    const quem = (await dbAll(db, `SELECT DISTINCT usuario_id FROM movimentacoes_almoxarifado
      WHERE requisicao_id = ? AND tipo = 'SAIDA' ORDER BY usuario_id`, [x.R])).map((r) => Number(r.usuario_id));
    assert.deepStrictEqual(quem, [USERS.ALMOX.id, USERS.ALMOX2.id], 'cada almoxarife baixou a sua parte');
    afirmarFila(gE, 'A2');
    // 3. o ultimo gesto: a assinatura (ENTREGUE assina), o detalhe a mostra, mais nada a entregar, o saldo
    const as = await assinar('ALMOX2', x.R, 'Recebedor 93T6');
    assert.strictEqual(as.status, 201, `assinatura: ${as.status} ${JSON.stringify(as.body)}`);
    const det = await como('ALMOX').get(`${API}/requisicoes/${x.R}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    assert.strictEqual(det.body.status, 'ENTREGUE');
    assert.deepStrictEqual((det.body.assinaturas_entrega || []).map((a) => a.recebedor_nome), ['Recebedor 93T6']);
    const terceira = await entregar('ALMOX', x.R, x.item, 1);
    assert.strictEqual(terceira.status, 400, `terceira: ${terceira.status} ${JSON.stringify(terceira.body)}`);
    assert.strictEqual(terceira.body.error, E0);
    assert.deepStrictEqual(await saldo(x.m), { q: 0, r: 0 });
    await afirmarA44Vazia(x.R, undefined, 'A');
  });

  // ══════════════ Jornada B — critico: conferencia, liberacao e a rodada que chega no instante ══════════════
  await test('[93 T6 B] critico pede 2, ADMIN aprova; ALMOX separa 1, ALMOX2 confere; no UPDATE da liberacao de ALMOX2 a rodada 2 de ALMOX espera -> liberar 200, rodada 2 400 S1, nada gravado; entrega 1 -> PARCIALMENTE; separa 1 -> conferencia limpa; confere; entrega 1 -> ENTREGUE, CONSUMIDA; saldo q=0 r=0; A44 vazia', async () => {
    desarmar();
    const x = await pedirEAprovar(await material(2, { critico: true }), 2);
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 1)).status, 200);
    const cf = await conferir('ALMOX2', x.R);
    assert.strictEqual(cf.status, 200, `conferir: ${cf.status} ${JSON.stringify(cf.body)}`);
    // 1. liberar x rodada 2
    const g = armarFila(RE.LIB, x.R, () => separar('ALMOX', x.R, x.item, 1));
    const lib = await comPrazo(liberar('ALMOX2', x.R), 10000, 'liberar');
    await afirmarGancho(g, 'B1');
    desarmar();
    assert.strictEqual(lib.status, 200, `liberar: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.strictEqual(g.resposta.status, 400, `rodada 2: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, S1);
    let f = await foto(x);
    assert.strictEqual(f.status, 'PRONTA_PARA_RETIRADA');
    assert.strictEqual(Number(f.conferido), USERS.ALMOX2.id, `conferido_por_id ${f.conferido}`);
    assert.strictEqual(f.sep, 1, 'nada gravado: separado 1');
    assert.strictEqual(f.rodadas.length, 1, 'nada gravado: 1 rodada');
    assert.strictEqual(await (await a44Para(x.R, ['e'])).e, undefined, 'A44 (e): nenhum critico liberado sem conferencia');
    afirmarFila(g, 'B1');
    // 2. a requisicao segue ate o fim
    const e1 = await entregar('ALMOX2', x.R, x.item, 1);
    assert.strictEqual(e1.status, 200, `entrega 1: ${e1.status} ${JSON.stringify(e1.body)}`);
    assert.strictEqual(e1.body.status, 'PARCIALMENTE_ATENDIDA');
    const s2 = await separar('ALMOX', x.R, x.item, 1);
    assert.strictEqual(s2.status, 200, `separa 1 de PARCIALMENTE: ${s2.status} ${JSON.stringify(s2.body)}`);
    assert.strictEqual(s2.body.status, 'EM_SEPARACAO');
    f = await foto(x);
    assert.strictEqual(f.conferido, null, 'a rodada nova limpou a conferencia (D3 da 28)');
    const barrado = await entregar('ALMOX2', x.R, x.item, 1);
    assert.strictEqual(barrado.status, 400, `entregar sem conferir: ${barrado.status} ${JSON.stringify(barrado.body)}`);
    const cf2 = await conferir('ALMOX2', x.R);
    assert.strictEqual(cf2.status, 200, `conferir 2: ${cf2.status} ${JSON.stringify(cf2.body)}`);
    const e2 = await entregar('ALMOX2', x.R, x.item, 1);
    assert.strictEqual(e2.status, 200, `entrega 2: ${e2.status} ${JSON.stringify(e2.body)}`);
    assert.strictEqual(e2.body.status, 'ENTREGUE');
    f = await foto(x);
    assert.strictEqual(f.status, 'ENTREGUE');
    assert.strictEqual(f.ent, 2); assert.strictEqual(f.saidas, 2);
    assert.strictEqual(f.reserva, 'CONSUMIDA'); assert.strictEqual(f.u, 2);
    assert.strictEqual(f.rodadas.length, 2);
    assert.ok(f.rodadas.every((r) => Number(r.usuario_id) === USERS.ALMOX.id), 'as duas rodadas sao de ALMOX');
    assert.deepStrictEqual(await saldo(x.m), { q: 0, r: 0 });
    await afirmarA44Vazia(x.R, undefined, 'B');
  });

  // ══════════════ Jornada C — exclusao pelas duas rotas; exclusao x entrega nos dois encaixes ══════════════
  const entregueViaRota = async (m, pede) => {
    const x = await pedirEAprovar(m, pede);
    assert.strictEqual((await separar('ALMOX', x.R, x.item, pede)).status, 200);
    const e = await entregar('ALMOX', x.R, x.item, pede);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(e.body.status, 'ENTREGUE', JSON.stringify(e.body));
    return x;
  };

  await test('[93 T6 C1] R3 ENTREGUE (4): DELETE /api/almoxarifado/requisicoes/:id e, no UPDATE ativo=0, DELETE /api/requisicoes-material/:id (espera) -> 200 + 404 N0; UM estorno de 4; q=4 r=0; UMA trilha EXCLUSAO; A44 (a)(c) vazias', async () => {
    desarmar();
    const x = await entregueViaRota(await material(4), 4);
    assert.deepStrictEqual(await saldo(x.m), { q: 0, r: 0 }, 'premissa: saiu tudo');
    const g = armarFila(RE.EXCL, x.R, () => excluirOutros('ADMIN', x.R));
    const e1 = await comPrazo(excluirAlmox('ADMIN', x.R), 10000, 'exclusao');
    await afirmarGancho(g, 'C1');
    desarmar();
    const f = await foto(x);
    const estornado = f.estornos.reduce((s, e) => s + Number(e.quantidade), 0);
    assert.strictEqual(estornado, 4, `estornado ${estornado} para 4 que sairam (${f.movs})`);
    assert.strictEqual(e1.status, 200, `primeira (rota do almoxarifado): ${e1.status} ${JSON.stringify(e1.body)}`);
    assert.strictEqual(e1.body.estornos.length, 1);
    assert.strictEqual(g.resposta.status, 404, `segunda (rota dos outros modulos): ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, N0);
    assert.strictEqual(f.estornos.length, 1);
    assert.strictEqual(f.acoes.filter((a) => a === 'EXCLUSAO').length, 1, `trilha ${f.acoes.join(',')}`);
    assert.strictEqual(f.status, 'CANCELADO'); assert.strictEqual(f.ativo, 0);
    assert.deepStrictEqual(await saldo(x.m), { q: 4, r: 0 }, 'saldo: voltou o que saiu, uma vez');
    await afirmarA44Vazia(x.R, ['a', 'c'], 'C1');
    afirmarFila(g, 'C1');
  });

  await test('[93 T6 C2] R4 EM_SEPARACAO (4 separados): no UPDATE ativo=0 da exclusao (rota dos outros modulos) a entrega de 4 espera -> exclusao 200; entrega 400 E0; nenhuma SAIDA; q=4 r=0; reserva LIBERADA; A44 (a)(c) vazias', async () => {
    desarmar();
    const x = await pedirEAprovar(await material(4), 4);
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const g = armarFila(RE.EXCL, x.R, () => entregar('ALMOX', x.R, x.item, 4));
    const exc = await comPrazo(excluirOutros('ADMIN', x.R), 10000, 'exclusao');
    await afirmarGancho(g, 'C2');
    desarmar();
    assert.strictEqual(exc.status, 200, `exclusao: ${exc.status} ${JSON.stringify(exc.body)}`);
    assert.strictEqual(g.resposta.status, 400, `entrega: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.error, E0);
    const f = await foto(x);
    assert.strictEqual(f.saidas, 0, `saidas ${f.movs}`);
    assert.strictEqual(f.reserva, 'LIBERADA');
    assert.strictEqual(f.status, 'CANCELADO'); assert.strictEqual(f.ativo, 0);
    assert.deepStrictEqual(await saldo(x.m), { q: 4, r: 0 });
    await afirmarA44Vazia(x.R, ['a', 'c'], 'C2');
    afirmarFila(g, 'C2');
  });

  await test('[93 T6 C3] R4b EM_SEPARACAO (4 separados): no UPDATE final da entrega de 4 a exclusao (rota do almoxarifado) espera -> entrega 200 ENTREGUE; exclusao 200 com estorno de 4; CANCELADO, ativo=0, SAIDA:4,ENTRADA:4; q=4 r=0; A44 (a)(c) vazias', async () => {
    desarmar();
    const x = await pedirEAprovar(await material(4), 4);
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const g = armarFila(RE.ENT, x.R, () => excluirAlmox('ADMIN', x.R));
    const ent = await comPrazo(entregar('ALMOX', x.R, x.item, 4), 10000, 'entrega');
    await afirmarGancho(g, 'C3');
    desarmar();
    assert.strictEqual(ent.status, 200, `entrega: ${ent.status} ${JSON.stringify(ent.body)}`);
    assert.strictEqual(ent.body.status, 'ENTREGUE');
    assert.strictEqual(g.resposta.status, 200, `exclusao: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(g.resposta.body.estornos.length, 1);
    const f = await foto(x);
    assert.strictEqual(f.status, 'CANCELADO', `status ${f.status} ativo ${f.ativo}`);
    assert.strictEqual(f.ativo, 0);
    assert.strictEqual(f.movs, 'SAIDA:4,ENTRADA:4');
    const exc = f.trilha.filter((t) => t.acao === 'EXCLUSAO');
    assert.strictEqual(exc.length, 1);
    assert.strictEqual(JSON.parse(exc[0].dados_anteriores).status, 'ENTREGUE', 'a trilha grava o status lido dentro da trava');
    assert.deepStrictEqual(await saldo(x.m), { q: 4, r: 0 });
    await afirmarA44Vazia(x.R, ['a', 'c'], 'C3');
    afirmarFila(g, 'C3');
  });

  // ══════════════ Jornada D — pelo servico, sem rota, sem gancho ══════════════
  await test('[93 T6 D1] requisitionService.entregarRequisicao x entregarRequisicao direto (ALMOX e ALMOX2, 2 + 2 de 4), Promise.all d=0, N=10 -> 0/10 com entregue != saidas ou fora de ENTREGUE', async () => {
    desarmar();
    let ruins = 0; const ex = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const x = await pedirEAprovar(await material(4), 4);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
      const ent = (u) => requisitionService.entregarRequisicao(db, x.R, [{ item_id: x.item, quantidade_atendida: 2 }], { ...u })
        .then((b) => b.status, (e) => `erro ${e.status} ${e.message}`);
      // eslint-disable-next-line no-await-in-loop
      const sts = await Promise.all([ent(USERS.ALMOX), ent(USERS.ALMOX2)]);
      // eslint-disable-next-line no-await-in-loop
      const f = await foto(x);
      const ok = sts.slice().sort().join('/') === 'ENTREGUE/PARCIALMENTE_ATENDIDA'
        && f.ent === 4 && f.saidas === 4 && f.status === 'ENTREGUE' && f.reserva === 'CONSUMIDA';
      if (!ok) { ruins++; if (ex.length < 2) ex.push(`${sts.join('/')} ent ${f.ent} saidas ${f.saidas} ${f.status} ${f.reserva}`); }
    }
    assert.strictEqual(ruins, 0, `${ruins}/10 divergentes: ${ex.join(' | ')}`);
  });

  await test('[93 T6 D2] requisitionService.excluirRequisicao x excluirRequisicao direto numa ENTREGUE (4), Promise.all d=0, N=10 -> 0/10 com estorno != saida (um resolve, o outro lanca 404 N0)', async () => {
    desarmar();
    let ruins = 0; const ex = [];
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const x = await entregueViaRota(await material(4), 4);
      const exc = () => requisitionService.excluirRequisicao(db, x.R, { ...USERS.ADMIN }, 'teste 93 T6 D')
        .then(() => 'ok', (e) => `${e.status}:${e.message}`);
      // eslint-disable-next-line no-await-in-loop
      const sts = await Promise.all([exc(), exc()]);
      // eslint-disable-next-line no-await-in-loop
      const f = await foto(x);
      const est = f.estornos.reduce((s, e) => s + Number(e.quantidade), 0);
      const ok = sts.slice().sort().join('|') === `404:${N0}|ok` && est === 4 && f.q === 4 && f.ativo === 0;
      if (!ok) { ruins++; if (ex.length < 2) ex.push(`${sts.join('/')} estornado ${est} q ${f.q}`); }
    }
    assert.strictEqual(ruins, 0, `${ruins}/10 divergentes: ${ex.join(' | ')}`);
  });

  // ══════════════ Jornada E — a 92 compoe ══════════════
  await test('[93 T6 E1] (RN-03 da 92) S cancela pelos outros modulos no instante da reivindicacao da separacao de ALMOX, AGUARDADO (fora da trava) -> sem deadlock; cancelamento 200, separacao 400 S1, CANCELADO, nada gravado, r=0', async () => {
    desarmar();
    const x = await pedirEAprovar(await material(4), 4);
    const g = armarAguardando(RE.CLAIM, () => cancelarOutros('S', x.R));
    const sep = await comPrazo(separar('ALMOX', x.R, x.item, 1), 10000, 'separacao');
    await afirmarGancho(g, 'E1');
    desarmar();
    assert.strictEqual(g.resposta.status, 200, `cancelamento: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(sep.status, 400, `separacao: ${sep.status} ${JSON.stringify(sep.body)}`);
    assert.strictEqual(sep.body.error, S1);
    const f = await foto(x);
    assert.strictEqual(f.status, 'CANCELADO');
    assert.strictEqual(f.sep, 0); assert.strictEqual(f.rodadas.length, 0);
    assert.strictEqual(f.reserva, 'LIBERADA');
    const tc = f.trilha.filter((t) => t.acao === 'CANCELAMENTO');
    assert.strictEqual(tc.length, 1); assert.strictEqual(Number(tc[0].usuario_id), USERS.S.id, 'quem cancelou foi S');
    assert.strictEqual(f.acoes.filter((a) => a === 'SEPARACAO').length, 0);
    assert.deepStrictEqual(await saldo(x.m), { q: 4, r: 0 });
    await afirmarA44Vazia(x.R, undefined, 'E1');
  });

  await test('[93 T6 E2] (RN-07 (b), 7a) de PARCIALMENTE_ATENDIDA (1 de 4), no UPDATE final da entrega de 1 de ALMOX, o ADMIN encerra (espera) -> entrega 200 PARCIALMENTE; encerrar 200 depois; ENCERRADA, reserva LIBERADA; uma nova entrega -> 400 E0; saldo q=2 r=0; A44 vazia', async () => {
    desarmar();
    const x = await pedirEAprovar(await material(4), 4);
    assert.strictEqual((await separar('ALMOX', x.R, x.item, 4)).status, 200);
    const e0 = await entregar('ALMOX', x.R, x.item, 1);
    assert.strictEqual(e0.body.status, 'PARCIALMENTE_ATENDIDA', JSON.stringify(e0.body));
    const g = armarFila(RE.ENT, x.R, () => encerrar('ADMIN', x.R));
    const ent = await comPrazo(entregar('ALMOX', x.R, x.item, 1), 10000, 'entrega');
    await afirmarGancho(g, 'E2');
    desarmar();
    assert.strictEqual(ent.status, 200, `entrega: ${ent.status} ${JSON.stringify(ent.body)}`);
    assert.strictEqual(ent.body.status, 'PARCIALMENTE_ATENDIDA', `a entrega terminou antes do encerramento: ${ent.body.status}`);
    assert.strictEqual(g.resposta.status, 200, `encerrar: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'ENCERRADA', `status ${f.status} (a encerrada voltou a aberta)`);
    assert.strictEqual(f.reserva, 'LIBERADA');
    assert.strictEqual(f.ent, 2); assert.strictEqual(f.saidas, 2);
    const enc = f.trilha.find((t) => t.acao === 'ENCERRAMENTO');
    assert.ok(enc, 'trilha ENCERRAMENTO'); assert.strictEqual(Number(enc.usuario_id), USERS.ADMIN.id);
    const depois = await entregar('ALMOX', x.R, x.item, 1);
    assert.strictEqual(depois.status, 400, `entregar depois de encerrada: ${depois.status} ${JSON.stringify(depois.body)}`);
    assert.strictEqual(depois.body.error, E0);
    assert.deepStrictEqual(await saldo(x.m), { q: 2, r: 0 });
    await afirmarA44Vazia(x.R, undefined, 'E2');
    afirmarFila(g, 'E2');
  });

  // ══════════════ A44 — controle positivo: as consultas sabem achar ══════════════
  await test('[93 T6 A44] controle: cada uma das cinco consultas ACHA o estado que a corrida produzia (montado a mao) — "A44 vazia" nas jornadas nao e teste vazio', async () => {
    desarmar();
    // (a) excluida que voltou a EM_SEPARACAO (o achado 7)
    const xa = await pedirEAprovar(await material(4), 4);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET ativo = 0, status = 'EM_SEPARACAO' WHERE id = ?", [xa.R]);
    // (b) item com entregue 2 para saidas 4 (a 4e)
    const xb = await entregueViaRota(await material(4), 4);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 2 WHERE id = ?', [xb.item]);
    // (c) excluida com estorno duplo (a 2b: estornado 8 para 4 que sairam): a exclusao real, estorno dobrado
    const xc = await entregueViaRota(await material(4), 4);
    assert.strictEqual((await excluirAlmox('ADMIN', xc.R)).status, 200);
    const dobrou = await dbRun(db, `UPDATE movimentacoes_almoxarifado SET quantidade = quantidade * 2
       WHERE requisicao_id = ? AND tipo = 'ENTRADA' AND motivo LIKE 'Estorno exclus%'`, [xc.R]);
    assert.strictEqual(dobrou.changes, 1, 'premissa: um estorno no livro');
    // (d) toda entregue parada em PARCIALMENTE_ATENDIDA (a 4b)
    const xd = await entregueViaRota(await material(4), 4);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'PARCIALMENTE_ATENDIDA' WHERE id = ?", [xd.R]);
    // (e) PRONTA com critico na caixa sem conferencia (a 3c)
    const xe = await pedirEAprovar(await material(2, { critico: true }), 2);
    assert.strictEqual((await separar('ALMOX', xe.R, xe.item, 1)).status, 200);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'PRONTA_PARA_RETIRADA', conferido_por_id = NULL WHERE id = ?", [xe.R]);
    const casos = { a: xa.R, b: xb.R, c: xc.R, d: xd.R, e: xe.R };
    for (const [l, R] of Object.entries(casos)) {
      // eslint-disable-next-line no-await-in-loop
      const achou = await a44Para(R, [l]);
      assert.ok(achou[l] && achou[l].length === 1, `A44 (${l}) nao achou R${R}`);
    }
    // e a mesma requisicao, sem a distorcao, nao e achada pelas outras quatro (a consulta nao acha tudo)
    for (const [l, R] of Object.entries(casos)) {
      const outras = ['a', 'b', 'c', 'd', 'e'].filter((o) => o !== l);
      // eslint-disable-next-line no-await-in-loop
      assert.deepStrictEqual(await a44Para(R, outras), {}, `A44: R${R} (caso ${l}) achado por outra consulta`);
    }
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
