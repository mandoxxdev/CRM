/**
 * Etapa 94 (T3) — integracao: a alcada de valor vale ate o comeco da separacao, cruzando as portas, pela rota e
 * pelo servico, com usuarios reais por header, cada jornada seguida ate o ultimo gesto.
 *
 * Os testes da T0-T2 (`alcadaValorDepoisDaSeparacao`) provam cada regra num gesto. Aqui a requisicao nasce como
 * na vida: o saldo entra por movimentacao ENTRADA (custo 1), S (sem perfil = PRODUCAO) pede 4 por
 * `POST /api/requisicoes-material` (R$ 4,00, abaixo do limite R$ 10,00), o ADMIN aprova pela rota (a aprovacao
 * reserva), ALMOX (ALMOXARIFE) separa, libera e entrega, ADMIN2 (id 2, unico aprovador de valor) aprova por
 * valor, e o custo sobe por uma ENTRADA cara (`POST …/movimentacoes/v2`) — o gatilho real (C166).
 *
 *  A — custo sobe no meio (PARCIALMENTE_ATENDIDA): a fila diz ENTREGAR, a entrega fecha; assinatura, saldo.
 *  B — custo sobe antes de separar (o caminho de projeto): fila APROVACAO_VALOR, 403 V403b, aprovar por valor,
 *      uma reserva so, separar, entregar.
 *  C — limite baixado (PRONTA) e alcada ligada (EM_SEPARACAO) pela rota de configuracao: a entrega fecha.
 *  D — pelo servico, sem rota: separarRequisicao/entregarRequisicao numa EM_SEPARACAO com caixa nao recusam;
 *      verificarBloqueioLiberacao numa TOTALMENTE_RESERVADA recusa com V403b.
 *  E — a corrida: separar x cancelar (outros modulos) no UPDATE da alcada -> 409 V1, CANCELADO, AV1.
 *  F — o legado (B458/B460): o estado que o desvio deixava sai pela fila (RETOMAR_SEPARACAO) e pela porta.
 *  G — a EM_SEPARACAO vazia (B462): limite baixado depois de "Iniciar Separacao" -> 403, aprovar, entregar.
 *  A45 — controle positivo (RN-06): cada consulta ACHA o seu estado (montado por escritor direto) e nao acha os
 *      negativos; coluna trocada -> o banco recusa. Sem isso "A45 vazia" nas jornadas seria teste que nao
 *      sabe falhar. Mais a A43 (a) achando a ressuscitada.
 *
 * Gatilho de configuracao: o PUT …/configuracoes/liberacao-valor responde 500 no harness (`getConfigForApi`
 * consulta `usuarios`, que o harness nao cria) mas GRAVA antes — o caso "A1" da rota; o teste afirma o efeito
 * lendo configuracoes_almoxarifado. Gancho da E: dispara o cancelamento e o AGUARDA (fora da trava, B450).
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa94-alcada-de-valor-ate-a-separacao.md (T3).
 *
 * Executar: cd server && node tests/api/alcadaValorDepoisDaSeparacaoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 94T3', role: 'admin', is_superadmin: 1, email: 'a94t3@t.com' },
  ADMIN2: { id: 2, nome: 'Adm2 94T3', role: 'admin', is_superadmin: 1, email: 'b94t3@t.com' },
  S: { id: 9431, nome: 'Solic 94T3', role: 'user', email: 's94t3@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9432, nome: 'Almox 94T3', role: 'user', email: 'x94t3@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
// Literais congeladas (plano, Contrato).
const V403B = /^Valor total \(R\$\s?[\d.,]+\) excede o limite de liberação automática \(R\$\s?[\d.,]+\)\. Aprovação de alto valor necessária\.$/;
const V1 = (st) => `A requisição mudou de status enquanto a alçada de valor era conferida (agora ${st}); recarregue e confira antes de separar.`;
const AV1 = 'Apenas requisições aguardando aprovação de valor podem ser liberadas';
const E0 = 'Requisição deve estar em separação, pronta para retirada ou parcialmente atendida';
const RE_ALCADA = /SET\s+status\s*=\s*\?,\s*requer_aprovacao_valor\s*=\s*1/;
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

// A45 (plano, "Letra A", com a regua da Fase 2 M3) — o texto da consulta sem mudar uma virgula; o teste filtra
// por requisicao por fora.
const A45 = {
  a: `SELECT rq.id, rq.numero, rq.status, i.id AS item_id,
       COALESCE(i.quantidade_separada,0) - COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) AS na_caixa,
       COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) AS entregue
  FROM requisicoes_almoxarifado rq JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
 WHERE COALESCE(rq.ativo,1) = 1 AND rq.status IN ('AGUARDANDO_APROVACAO_VALOR','REJEITADO','CANCELADO')
   AND (COALESCE(i.quantidade_separada,0) > 1e-9 OR COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) > 1e-9)
 ORDER BY rq.id`,
  b: `SELECT rq.id, rq.numero, rq.status, i.id AS item_id, COALESCE(i.quantidade_separada,0) AS separado,
       COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) AS entregue
  FROM requisicoes_almoxarifado rq JOIN itens_requisicao_almoxarifado i ON i.requisicao_id = rq.id
 WHERE COALESCE(rq.ativo,1) = 1
   AND rq.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA')
   AND (COALESCE(i.quantidade_separada,0) > 1e-9 OR COALESCE(i.quantidade_entregue, i.quantidade_atendida, 0) > 1e-9)
 ORDER BY rq.id`,
};
// A43 (a) (Etapa 92) — a ressuscitada; o texto do documento de novidades.
const A43A = `SELECT rq.id, rq.numero, rq.status, MAX(a.created_at) AS cancelada_em
  FROM requisicoes_almoxarifado rq
  JOIN auditoria_log_almoxarifado a ON a.entidade = 'requisicao' AND a.entidade_id = rq.id AND a.acao = 'CANCELAMENTO'
 WHERE rq.status <> 'CANCELADO' AND COALESCE(rq.ativo, 1) = 1
 GROUP BY rq.id, rq.numero, rq.status ORDER BY rq.id`;

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);

// Espiao de notificarAprovadoresValor pelo objeto do modulo (I3: a verificacao chama por ele).
const notificados = [];
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };
const notificacoesDe = (R) => notificados.filter((id) => id === Number(R)).length;

(async () => {
  console.log('\n=== Etapa 94 (T3): integracao — a alcada de valor vale ate o comeco da separacao, rota e servico ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (sem header: ADMIN) — molde da 92/93.
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

  // ── gancho no SQL: dispara o gesto, AGUARDA a resposta, so entao emite o comando retido ──
  const origRun = db.run.bind(db);
  let ganchos = [];
  db.run = function (sql, ...rest) {
    const s = String(sql);
    for (const g of ganchos) {
      if (g.armado && g.re.test(s)) {
        g.armado = false; g.disparos++;
        g.promessa = comPrazo(Promise.resolve().then(g.fn), 5000, 'gesto aguardado no gancho')
          .then((r) => { g.resposta = r; }, (e) => { g.erro = e; })
          .then(() => origRun(sql, ...rest));
        return this;
      }
    }
    return origRun(sql, ...rest);
  };
  const armar = (re, fn) => { const g = { re, fn, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };

  // ── configuracao da alcada: escritor direto so no setup/restauro; os gatilhos usam a rota ──
  const config = async ({ ativo = 1, limite = 10 } = {}) => {
    for (const [k, v] of [['liberacao_valor_ativo', String(ativo)], ['liberacao_valor_limite', String(limite)],
      ['liberacao_valor_aprovadores', '[2]']]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    }
  };
  const lerConfig = async (k) => (await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [k]))?.valor;
  /** PUT da configuracao pela rota (ADMIN). Responde 500 no harness e grava — afirma o efeito. */
  const configPelaRota = async ({ ativo = true, limite }) => {
    await como('ADMIN').put(`${API}/configuracoes/liberacao-valor`, { ativo, limite, aprovadorIds: [2] });
    assert.strictEqual(Number(await lerConfig('liberacao_valor_limite')), limite, 'premissa: o PUT da configuracao gravou o limite');
    assert.ok(['1', 'true'].includes(String(await lerConfig('liberacao_valor_ativo'))), 'premissa: o PUT ligou a alcada');
  };

  // ── fixtures pela porta de sempre ──
  const material = async (q = 8) => {
    const c = `E94T3-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico, custo_unitario)
      VALUES (?, ?, 'PC', 0, 0, 1, 0, 1)`, [c, `Mat ${c}`])).lastID;
    const e = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: id, tipo: 'ENTRADA', quantidade: q, custo_unitario: 1, motivo: 'Ajuste', justificativa: 'e94t3 saldo' });
    assert.ok([200, 201].includes(e.status), `ENTRADA de saldo: ${e.status} ${JSON.stringify(e.body)}`);
    return id;
  };
  /** S pede 4 (R$ 4,00), o ADMIN aprova pela rota (a aprovacao reserva) -> TOTALMENTE_RESERVADA. */
  const pedirEAprovar = async (m, pede = 4) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-94T3', itens: [{ material_id: m, quantidade: pede }],
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const R = cr.body.id;
    const row0 = await dbGet(db, 'SELECT solicitante_id, status, valor_total FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(Number(row0.solicitante_id), USERS.S.id, 'quem pediu foi S');
    assert.strictEqual(row0.status, 'PENDENTE', `criada: ${row0.status}`);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${ap.status} ${JSON.stringify(ap.body)}`);
    const row = await dbGet(db, 'SELECT status, aprovador_id, valor_total FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(row.status, 'TOTALMENTE_RESERVADA', `aprovada: ${row.status}`);
    assert.strictEqual(Number(row.aprovador_id), USERS.ADMIN.id, 'quem aprovou foi o ADMIN');
    assert.strictEqual(Number(row.valor_total), 4, `valor da criacao/aprovacao: ${row.valor_total}`);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    return { m, R, item };
  };
  const separar = (k, x, q) => como(k).put(`${API}/requisicoes/${x.R}/separar`,
    { itens_separados: q ? [{ item_id: x.item, quantidade_separada: q }] : [] });
  const liberar = (k, x) => como(k).put(`${API}/requisicoes/${x.R}/liberar-retirada`);
  const entregar = (k, x, q) => como(k).put(`${API}/requisicoes/${x.R}/entregar`,
    { itens_atendidos: [{ item_id: x.item, quantidade_atendida: q }] });
  const aprovarValor = (x) => como('ADMIN2').put(`${API}/requisicoes/${x.R}/aprovar-valor`, {});
  const cancelarOutros = (k, x) => como(k).put(`/api/requisicoes-material/${x.R}/cancelar`, {});
  const assinar = (k, x, recebedor) => request(app).post(`${API}/requisicoes/${x.R}/assinatura-entrega`)
    .set('x-teste-usuario', k).field('recebedor_nome', recebedor).attach('assinatura', PNG_1PX, 'assinatura.png').then((r) => r);
  /** O gatilho real: uma nota cara de outro pedido sobe o custo medio (ADMIN, pela rota). */
  const entradaCara = async (x) => {
    const e = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: x.m, tipo: 'ENTRADA', quantidade: 1, custo_unitario: 1000, motivo: 'nota cara 94T3' });
    assert.ok([200, 201].includes(e.status), `entrada cara: ${e.status} ${JSON.stringify(e.body)}`);
    // o gatilho tem dente: o valor AO VIVO (so leitura) passou do limite
    const av = await valueApprovalService.avaliarRequisicaoValor(db, x.R);
    assert.ok(Number(av.valor_total) > 10, `premissa: a entrada cara subiu o valor ao vivo (${av.valor_total})`);
  };
  const ok = (r, rotulo) => assert.ok(r.status === 200 || r.status === 201, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);

  const foto = async (x) => {
    const rq = await dbGet(db, `SELECT status, valor_total, COALESCE(requer_aprovacao_valor,0) rav, data_aprovacao_valor dav
      FROM requisicoes_almoxarifado WHERE id = ?`, [x.R]);
    const it = await dbGet(db, `SELECT COALESCE(quantidade_separada,0) sep, COALESCE(quantidade_entregue,0) ent
      FROM itens_requisicao_almoxarifado WHERE id = ?`, [x.item]);
    const rv = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id = ? ORDER BY id', [x.R]);
    const movs = await dbAll(db, `SELECT tipo, quantidade FROM movimentacoes_almoxarifado
      WHERE requisicao_id = ? AND COALESCE(cancelado,0) = 0`, [x.R]);
    const rods = await dbGet(db, 'SELECT COUNT(*) n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [x.R]);
    return {
      status: rq.status, valor_total: Number(rq.valor_total), rav: Number(rq.rav), dav: rq.dav,
      sep: Number(it.sep), ent: Number(it.ent), reservas: rv.map((r) => r.status).join(','),
      saidas: movs.filter((m) => m.tipo === 'SAIDA').reduce((s, m) => s + Number(m.quantidade), 0),
      rodadas: Number(rods.n),
    };
  };
  /** Consulta de saldo pela rota (o ultimo gesto de quem confere o estoque). */
  const saldo = async (m) => {
    const r = await como('ALMOX').get(`${API}/materiais/${m}`);
    assert.strictEqual(r.status, 200, `GET material: ${r.status} ${JSON.stringify(r.body)}`);
    return { q: Number(r.body.quantidade_atual), r: Number(r.body.quantidade_reservada || 0) };
  };
  const linhaDaFila = async (x) => {
    const r = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(r.status, 200, `fila: ${r.status} ${JSON.stringify(r.body)}`);
    return (Array.isArray(r.body) ? r.body : []).find((l) => Number(l.id) === Number(x.R)) || null;
  };
  /** A45 (a)(b) e A43 (a) para R (o texto das consultas, filtrado por fora). */
  const consultasPara = async (R) => {
    const achou = {};
    for (const [nome, sql] of [['A45a', A45.a], ['A45b', A45.b], ['A43a', A43A]]) {
      // eslint-disable-next-line no-await-in-loop
      const linhas = await dbAll(db, `SELECT * FROM (${sql}) WHERE id = ?`, [R]);
      if (linhas.length) achou[nome] = linhas;
    }
    return achou;
  };
  const afirmarConsultasVazias = async (x, rotulo) => {
    const achou = await consultasPara(x.R);
    assert.deepStrictEqual(achou, {}, `${rotulo}: as consultas acharam R${x.R}: ${JSON.stringify(achou)}`);
  };
  /** O fim de toda jornada que entrega tudo: ENTREGUE, entregue 4 = saidas 4, reserva CONSUMIDA, assinatura,
   *  mais nada a entregar, saldo pela rota, consultas vazias. */
  const fecharEntregue = async (x, rotulo, { q }) => {
    const f = await foto(x);
    assert.strictEqual(f.status, 'ENTREGUE', `${rotulo}: status ${f.status}`);
    assert.strictEqual(f.ent, 4, `${rotulo}: entregue ${f.ent}`);
    assert.strictEqual(f.saidas, 4, `${rotulo}: saidas ${f.saidas}`);
    assert.strictEqual(f.reservas, 'CONSUMIDA', `${rotulo}: reservas ${f.reservas}`);
    const as = await assinar('ALMOX', x, `Recebedor ${rotulo}`);
    assert.strictEqual(as.status, 201, `${rotulo}: assinatura ${as.status} ${JSON.stringify(as.body)}`);
    const det = await como('ALMOX').get(`${API}/requisicoes/${x.R}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    assert.strictEqual(det.body.status, 'ENTREGUE');
    const mais = await entregar('ALMOX', x, 1);
    assert.strictEqual(mais.status, 400, `${rotulo}: entregar de novo ${mais.status} ${JSON.stringify(mais.body)}`);
    assert.strictEqual(mais.body.error, E0);
    assert.deepStrictEqual(await saldo(x.m), { q, r: 0 }, `${rotulo}: saldo`);
    await afirmarConsultasVazias(x, rotulo);
  };

  await config({ ativo: 1, limite: 10 });

  // ══════════════ Jornada A — custo sobe no meio, pela rota ══════════════
  await test('[94 T3 A] S pede 4, ADMIN aprova; ALMOX separa 4, entrega 2 (PARCIALMENTE_ATENDIDA); ADMIN faz a entrada cara; a fila diz ENTREGAR; ALMOX entrega 2 -> 200 ENTREGUE, entregue 4 = saidas 4, CONSUMIDA, valor_total 4, nenhuma notificacao; assinatura, saldo q=5 r=0; A45 (a)(b) e A43 (a) vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', x, 4), 'separar 4');
    const e1 = await entregar('ALMOX', x, 2);
    ok(e1, 'entregar 2');
    assert.strictEqual(e1.body.status, 'PARCIALMENTE_ATENDIDA');
    await entradaCara(x);
    const l = await linhaDaFila(x);
    assert.ok(l, 'A: ausente da fila');
    assert.ok(l.etapas.includes('ENTREGAR') && !l.etapas.includes('APROVACAO_VALOR'), `A: fila ${JSON.stringify(l.etapas)}`);
    const e2 = await entregar('ALMOX', x, 2);
    assert.strictEqual(e2.status, 200, `A: ultima entrega ${e2.status} ${JSON.stringify(e2.body)}`);
    assert.strictEqual(e2.body.status, 'ENTREGUE');
    const f = await foto(x);
    assert.strictEqual(f.valor_total, 4, `A: valor_total ${f.valor_total} (B455)`);
    assert.strictEqual(f.rav, 0, 'A: requer_aprovacao_valor');
    assert.strictEqual(notificacoesDe(x.R), 0, 'A: notificou os aprovadores');
    await fecharEntregue(x, 'A', { q: 5 });
  });

  // ══════════════ Jornada B — custo sobe antes de separar (o caminho de projeto) ══════════════
  await test('[94 T3 B] R aprovada; entrada cara; fila APROVACAO_VALOR; ALMOX separa 4 -> 403 V403b, AGUARDANDO_APROVACAO_VALOR, reserva ATIVA intacta, 1 notificacao; ADMIN2 aprova por valor -> TOTALMENTE_RESERVADA com UMA reserva ATIVA; fila SEPARAR; separa 4, entrega 4 -> ENTREGUE; saldo q=5 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    await entradaCara(x);
    let l = await linhaDaFila(x);
    assert.ok(l, 'B: ausente da fila');
    assert.deepStrictEqual(l.etapas, ['APROVACAO_VALOR'], 'B: a fila antes da aprovacao por valor');
    const s = await separar('ALMOX', x, 4);
    assert.strictEqual(s.status, 403, `B: separar ${s.status} ${JSON.stringify(s.body)}`);
    assert.match(s.body.error, V403B);
    let f = await foto(x);
    assert.strictEqual(f.status, 'AGUARDANDO_APROVACAO_VALOR');
    assert.strictEqual(f.reservas, 'ATIVA', `B: reservas ${f.reservas}`);
    assert.strictEqual(f.sep, 0); assert.strictEqual(f.rodadas, 0);
    assert.strictEqual(notificacoesDe(x.R), 1, `B: notificado ${notificacoesDe(x.R)} vez(es)`);
    const a = await aprovarValor(x);
    assert.strictEqual(a.status, 200, `B: aprovar-valor ${a.status} ${JSON.stringify(a.body)}`);
    f = await foto(x);
    assert.strictEqual(f.status, 'TOTALMENTE_RESERVADA', `B: depois do aprovar-valor ${f.status}`);
    assert.strictEqual(f.reservas, 'ATIVA', `B: reservas ${f.reservas} (uma so)`);
    l = await linhaDaFila(x);
    assert.ok(l && l.etapas.includes('SEPARAR') && !l.etapas.includes('APROVACAO_VALOR'), `B: fila ${JSON.stringify(l && l.etapas)}`);
    ok(await separar('ALMOX', x, 4), 'B: separar 4');
    const e = await entregar('ALMOX', x, 4);
    assert.strictEqual(e.status, 200, `B: entregar 4 ${e.status} ${JSON.stringify(e.body)}`);
    assert.strictEqual(notificacoesDe(x.R), 1, 'B: notificou de novo depois de aprovada');
    await fecharEntregue(x, 'B', { q: 5 });
  });

  // ══════════════ Jornada C — limite baixado e alcada ligada no meio, pela rota de configuracao ══════════════
  await test('[94 T3 C1] R PRONTA_PARA_RETIRADA; PUT da configuracao (limite 1, pela rota); ALMOX entrega 4 -> 200 ENTREGUE, valor_total 4, nenhuma notificacao; saldo q=4 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    try {
      ok(await separar('ALMOX', x, 4), 'separar 4');
      ok(await liberar('ALMOX', x), 'liberar');
      assert.strictEqual((await foto(x)).status, 'PRONTA_PARA_RETIRADA');
      await configPelaRota({ limite: 1 });
      const e = await entregar('ALMOX', x, 4);
      assert.strictEqual(e.status, 200, `C1: entregar ${e.status} ${JSON.stringify(e.body)}`);
      const f = await foto(x);
      assert.strictEqual(f.valor_total, 4, `C1: valor_total ${f.valor_total}`);
      assert.strictEqual(notificacoesDe(x.R), 0, 'C1: notificou');
      await fecharEntregue(x, 'C1', { q: 4 });
    } finally { await config({ ativo: 1, limite: 10 }); }
  });
  await test('[94 T3 C2] alcada DESLIGADA na criacao, na aprovacao e na separacao (EM_SEPARACAO com 4); ligada depois pela rota (limite 1); ALMOX entrega 4 -> 200 ENTREGUE, nenhuma notificacao; saldo q=4 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 0, limite: 10 });
    try {
      const x = await pedirEAprovar(await material(8));
      ok(await separar('ALMOX', x, 4), 'separar 4');
      assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
      await configPelaRota({ limite: 1 });
      const e = await entregar('ALMOX', x, 4);
      assert.strictEqual(e.status, 200, `C2: entregar ${e.status} ${JSON.stringify(e.body)}`);
      assert.strictEqual(notificacoesDe(x.R), 0, 'C2: notificou');
      assert.strictEqual((await foto(x)).rav, 0, 'C2: requer_aprovacao_valor');
      await fecharEntregue(x, 'C2', { q: 4 });
    } finally { await config({ ativo: 1, limite: 10 }); }
  });

  // ══════════════ Jornada D — pelo servico, sem rota ══════════════
  await test('[94 T3 D1] pelo servico: EM_SEPARACAO com 2 de 4 separados, entrada cara; requisitionService.separarRequisicao(2) e entregarRequisicao(4) DIRETO -> sem 403, EM_SEPARACAO e ENTREGUE, valor_total 4, nenhuma notificacao; saldo q=5 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', x, 2), 'separar 2');
    await entradaCara(x);
    let sep; let erroSep;
    try { sep = await requisitionService.separarRequisicao(db, x.R, [{ item_id: x.item, quantidade_separada: 2 }], { ...USERS.ALMOX }); } catch (e) { erroSep = e; }
    assert.ok(!erroSep, `D1: separarRequisicao lancou ${erroSep && erroSep.status} ${erroSep && erroSep.message}`);
    assert.strictEqual(sep.status, 'EM_SEPARACAO', `D1: separar ${JSON.stringify(sep)}`);
    assert.strictEqual((await foto(x)).sep, 4);
    let ent; let erroEnt;
    try { ent = await requisitionService.entregarRequisicao(db, x.R, [{ item_id: x.item, quantidade_atendida: 4 }], { ...USERS.ALMOX }); } catch (e) { erroEnt = e; }
    assert.ok(!erroEnt, `D1: entregarRequisicao lancou ${erroEnt && erroEnt.status} ${erroEnt && erroEnt.message}`);
    assert.strictEqual(ent.status, 'ENTREGUE', `D1: entregar ${JSON.stringify(ent)}`);
    assert.strictEqual((await foto(x)).valor_total, 4, 'D1: valor_total');
    assert.strictEqual(notificacoesDe(x.R), 0, 'D1: notificou');
    await fecharEntregue(x, 'D1', { q: 5 });
  });
  await test('[94 T3 D2] pelo servico: TOTALMENTE_RESERVADA sem caixa, entrada cara; valueApprovalService.verificarBloqueioLiberacao DIRETO -> 403 V403b, AGUARDANDO_APROVACAO_VALOR, 1 notificacao; ADMIN2 aprova por valor (rota); separar 4 e entregar 4 pelo servico -> ENTREGUE; saldo q=5 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    await entradaCara(x);
    let erro;
    try { await valueApprovalService.verificarBloqueioLiberacao(db, x.R); } catch (e) { erro = e; }
    assert.ok(erro, 'D2: a verificacao direta nao recusou');
    assert.strictEqual(erro.status, 403, `D2: ${erro.status} ${erro.message}`);
    assert.strictEqual(erro.code, 'AGUARDANDO_APROVACAO_VALOR');
    assert.match(erro.message, V403B);
    assert.strictEqual((await foto(x)).status, 'AGUARDANDO_APROVACAO_VALOR');
    assert.strictEqual(notificacoesDe(x.R), 1, `D2: notificado ${notificacoesDe(x.R)} vez(es)`);
    const a = await aprovarValor(x);
    assert.strictEqual(a.status, 200, `D2: aprovar-valor ${a.status} ${JSON.stringify(a.body)}`);
    assert.strictEqual((await foto(x)).status, 'TOTALMENTE_RESERVADA');
    const sep = await requisitionService.separarRequisicao(db, x.R, [{ item_id: x.item, quantidade_separada: 4 }], { ...USERS.ALMOX });
    assert.strictEqual(sep.status, 'EM_SEPARACAO');
    const ent = await requisitionService.entregarRequisicao(db, x.R, [{ item_id: x.item, quantidade_atendida: 4 }], { ...USERS.ALMOX });
    assert.strictEqual(ent.status, 'ENTREGUE');
    await fecharEntregue(x, 'D2', { q: 5 });
  });

  // ══════════════ Jornada E — a corrida, pela rota ══════════════
  await test('[94 T3 E] R aprovada, entrada cara; no UPDATE da alcada S cancela pelos outros modulos (aguardado) -> cancelamento 200, separacao 409 V1 "agora CANCELADO", CANCELADO, reserva LIBERADA, 0 rodadas, nenhuma notificacao; /aprovar-valor 400 AV1 sem reserva nova; saldo q=9 r=0; A43 (a) e A45 vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    await entradaCara(x);
    const g = armar(RE_ALCADA, () => cancelarOutros('S', x));
    let s;
    try { s = await comPrazo(separar('ALMOX', x, 4), 10000, 'separacao'); } finally { desarmar(); }
    await g.promessa;
    assert.strictEqual(g.disparos, 1, `E: o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, g.erro && g.erro.message);
    assert.strictEqual(g.resposta.status, 200, `E: cancelar ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    const f = await foto(x);
    assert.strictEqual(f.status, 'CANCELADO', `E: status final ${f.status}`);
    assert.strictEqual(s.status, 409, `E: separar ${s.status} ${JSON.stringify(s.body)}`);
    assert.strictEqual(s.body.error, V1('CANCELADO'));
    assert.strictEqual(f.reservas, 'LIBERADA', `E: reservas ${f.reservas}`);
    assert.strictEqual(f.rodadas, 0); assert.strictEqual(f.sep, 0);
    assert.strictEqual(notificacoesDe(x.R), 0, `E: notificado ${notificacoesDe(x.R)} vez(es)`);
    const a = await aprovarValor(x);
    assert.strictEqual(a.status, 400, `E: aprovar-valor ${a.status} ${JSON.stringify(a.body)}`);
    assert.strictEqual(a.body.error, AV1);
    assert.strictEqual((await foto(x)).reservas, 'LIBERADA', 'E: reserva nova depois do aprovar-valor');
    assert.deepStrictEqual(await saldo(x.m), { q: 9, r: 0 }, 'E: saldo');
    await afirmarConsultasVazias(x, 'E');
  });

  // ══════════════ Jornada F — o legado (B458, B460) ══════════════
  await test('[94 T3 F] legado: R separada 4, entregue 2, entrada cara, levada por escritor direto a AGUARDANDO_APROVACAO_VALOR (o que o desvio deixava) -> A45 (a) lista R; ADMIN2 aprova por valor -> TOTALMENTE_RESERVADA, A45 (b) lista R; a fila traz RETOMAR_SEPARACAO; ALMOX separa vazio -> 200 EM_SEPARACAO sem 403 e sem notificacao; entrega 2 -> ENTREGUE; valor_total intacto; saldo q=5 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', x, 4), 'separar 4');
    ok(await entregar('ALMOX', x, 2), 'entregar 2');
    await entradaCara(x);
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'AGUARDANDO_APROVACAO_VALOR', requer_aprovacao_valor = 1 WHERE id = ?", [x.R]);
    let c = await consultasPara(x.R);
    assert.deepStrictEqual(Object.keys(c), ['A45a'], `F: legado aguardando — consultas ${JSON.stringify(c)}`);
    assert.strictEqual(Number(c.A45a[0].na_caixa), 2); assert.strictEqual(Number(c.A45a[0].entregue), 2);
    const a = await aprovarValor(x);
    assert.strictEqual(a.status, 200, `F: aprovar-valor ${a.status} ${JSON.stringify(a.body)}`);
    let f = await foto(x);
    assert.strictEqual(f.status, 'TOTALMENTE_RESERVADA', `F: depois do aprovar-valor ${f.status}`);
    const valorAprovado = f.valor_total;
    c = await consultasPara(x.R);
    assert.deepStrictEqual(Object.keys(c), ['A45b'], `F: legado aprovado — consultas ${JSON.stringify(c)}`);
    const l = await linhaDaFila(x);
    assert.ok(l, 'F: o legado some da fila');
    assert.ok(l.etapas.includes('RETOMAR_SEPARACAO') && !l.etapas.includes('SEPARAR'), `F: fila ${JSON.stringify(l.etapas)}`);
    assert.strictEqual(l.acionavel, true, 'F: nao acionavel');
    const s = await separar('ALMOX', x, 0);
    assert.strictEqual(s.status, 200, `F: separar vazio ${s.status} ${JSON.stringify(s.body)}`);
    f = await foto(x);
    assert.strictEqual(f.status, 'EM_SEPARACAO');
    assert.strictEqual(f.valor_total, valorAprovado, `F: valor_total ${valorAprovado} -> ${f.valor_total} (B455)`);
    const e = await entregar('ALMOX', x, 2);
    assert.strictEqual(e.status, 200, `F: entregar 2 ${e.status} ${JSON.stringify(e.body)}`);
    assert.strictEqual(e.body.status, 'ENTREGUE');
    assert.strictEqual((await foto(x)).valor_total, valorAprovado, 'F: valor_total na entrega (B455)');
    assert.strictEqual(notificacoesDe(x.R), 0, 'F: notificou');
    await fecharEntregue(x, 'F', { q: 5 });
  });

  // ══════════════ Jornada G — a EM_SEPARACAO vazia (B462) ══════════════
  await test('[94 T3 G] R aprovada; Iniciar Separacao sem quantidade (valor abaixo) -> EM_SEPARACAO vazia; PUT da configuracao (limite 1); separar 4 -> 403 V403b, AGUARDANDO_APROVACAO_VALOR, 1 notificacao; ADMIN2 aprova por valor; separar 4, entregar 4 -> ENTREGUE; saldo q=4 r=0; consultas vazias', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const x = await pedirEAprovar(await material(8));
    try {
      ok(await separar('ALMOX', x, 0), 'iniciar separacao vazia');
      let f = await foto(x);
      assert.strictEqual(f.status, 'EM_SEPARACAO'); assert.strictEqual(f.sep, 0);
      await configPelaRota({ limite: 1 });
      const s = await separar('ALMOX', x, 4);
      assert.strictEqual(s.status, 403, `G: separar 4 na EM_SEPARACAO vazia ${s.status} ${JSON.stringify(s.body)} (a alcada contornada)`);
      assert.match(s.body.error, V403B);
      f = await foto(x);
      assert.strictEqual(f.status, 'AGUARDANDO_APROVACAO_VALOR');
      assert.strictEqual(f.sep, 0);
      assert.strictEqual(notificacoesDe(x.R), 1, `G: notificado ${notificacoesDe(x.R)} vez(es)`);
      const a = await aprovarValor(x);
      assert.strictEqual(a.status, 200, `G: aprovar-valor ${a.status} ${JSON.stringify(a.body)}`);
      f = await foto(x);
      assert.strictEqual(f.status, 'TOTALMENTE_RESERVADA', `G: depois do aprovar-valor ${f.status}`);
      assert.strictEqual(f.reservas, 'ATIVA', `G: reservas ${f.reservas}`);
      ok(await separar('ALMOX', x, 4), 'G: separar 4');
      const e = await entregar('ALMOX', x, 4);
      assert.strictEqual(e.status, 200, `G: entregar 4 ${e.status} ${JSON.stringify(e.body)}`);
      await fecharEntregue(x, 'G', { q: 4 });
    } finally { await config({ ativo: 1, limite: 10 }); }
  });

  // ══════════════ A45 — controle positivo (RN-06) ══════════════
  await test('[94 T3 A45] (RN-06) controle: A45 (a) acha P1 (EM_SEPARACAO->aguardando), P2 (PARCIAL->aguardando->reprovada), P3 (PRONTA->aguardando->cancelada); A45 (b) acha P4 (PARCIAL->aguardando->aprovada por valor); A43 (a) acha P5 (ressuscitada); N1-N4 em nenhuma; coluna trocada -> o banco recusa', async () => {
    desarmar(); await config({ ativo: 1, limite: 10 });
    const AGUARDA = "UPDATE requisicoes_almoxarifado SET status = 'AGUARDANDO_APROVACAO_VALOR', requer_aprovacao_valor = 1 WHERE id = ?";
    // P1
    const p1 = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', p1, 4), 'P1 separar');
    await dbRun(db, AGUARDA, [p1.R]);
    // P2
    const p2 = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', p2, 4), 'P2 separar'); ok(await entregar('ALMOX', p2, 2), 'P2 entregar');
    await dbRun(db, AGUARDA, [p2.R]);
    ok(await como('ADMIN2').put(`${API}/requisicoes/${p2.R}/rejeitar-valor`, { motivo: 'caro 94T3' }), 'P2 reprovar');
    assert.strictEqual((await foto(p2)).status, 'REJEITADO');
    // P3
    const p3 = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', p3, 4), 'P3 separar'); ok(await liberar('ALMOX', p3), 'P3 liberar');
    await dbRun(db, AGUARDA, [p3.R]);
    ok(await como('S').put(`${API}/requisicoes/${p3.R}/cancelar`, { motivo: 'desisti 94T3' }), 'P3 cancelar');
    assert.strictEqual((await foto(p3)).status, 'CANCELADO');
    // P4
    const p4 = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', p4, 4), 'P4 separar'); ok(await entregar('ALMOX', p4, 2), 'P4 entregar');
    await dbRun(db, AGUARDA, [p4.R]);
    ok(await aprovarValor(p4), 'P4 aprovar-valor');
    assert.strictEqual((await foto(p4)).status, 'TOTALMENTE_RESERVADA');
    // P5 — a ressuscitada (C164): cancelada e de volta a aguardando
    const p5 = await pedirEAprovar(await material(8));
    ok(await cancelarOutros('S', p5), 'P5 cancelar');
    await dbRun(db, AGUARDA, [p5.R]);
    // N1 — RESERVADA -> aguardando (pelo caminho de projeto) -> reprovada
    const n1 = await pedirEAprovar(await material(8));
    await entradaCara(n1);
    assert.strictEqual((await separar('ALMOX', n1, 4)).status, 403, 'N1 premissa: 403');
    ok(await como('ADMIN2').put(`${API}/requisicoes/${n1.R}/rejeitar-valor`, { motivo: 'caro 94T3' }), 'N1 reprovar');
    // N2 — fluxo normal
    const n2 = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', n2, 4), 'N2 separar'); ok(await entregar('ALMOX', n2, 4), 'N2 entregar');
    // N3 — EM_SEPARACAO sem custo subir
    const n3 = await pedirEAprovar(await material(8));
    ok(await separar('ALMOX', n3, 4), 'N3 separar');
    // N4 — RESERVADA -> aguardando (caminho de projeto)
    const n4 = await pedirEAprovar(await material(8));
    await entradaCara(n4);
    assert.strictEqual((await separar('ALMOX', n4, 4)).status, 403, 'N4 premissa: 403');
    const esperado = {
      P1: ['A45a'], P2: ['A45a'], P3: ['A45a'], P4: ['A45b'], P5: ['A43a'], N1: [], N2: [], N3: [], N4: [],
    };
    const casos = { P1: p1, P2: p2, P3: p3, P4: p4, P5: p5, N1: n1, N2: n2, N3: n3, N4: n4 };
    const erros = [];
    for (const [nome, x] of Object.entries(casos)) {
      // eslint-disable-next-line no-await-in-loop
      const achou = Object.keys(await consultasPara(x.R));
      if (JSON.stringify(achou) !== JSON.stringify(esperado[nome])) {
        // eslint-disable-next-line no-await-in-loop
        erros.push(`${nome} (${(await foto(x)).status}): ${JSON.stringify(achou)} (esperado ${JSON.stringify(esperado[nome])})`);
      }
    }
    assert.deepStrictEqual(erros, [], erros.join(' | '));
    // coluna trocada de proposito: o banco recusa as duas (a consulta nao passa vazia por erro de nome)
    for (const [l, sql] of Object.entries(A45)) {
      let recusou = null;
      // eslint-disable-next-line no-await-in-loop
      try { await dbAll(db, sql.replace(/quantidade_separada/g, 'quantidade_separadaX')); } catch (e) { recusou = e; }
      assert.ok(recusou && /no such column/i.test(recusou.message), `A45 (${l}) com coluna trocada: ${recusou && recusou.message}`);
    }
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
