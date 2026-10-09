/**
 * Etapa 95 (T4) — integracao: a separacao nao aceita mais do que existe na prateleira, cruzando a porta (T0), a
 * segunda rodada da entrega (T0b), a fila e o detalhe (T1) e a aprovacao (T2), pela rota e pelo servico, com usuarios
 * reais por header, cada jornada seguida ate o ultimo gesto (entrega, encerramento ou cancelamento; saldo pela rota;
 * A46 vazia para o material).
 *
 * A porta, a fila, o detalhe e a aprovacao leem a mesma conta (o teto) por tres caminhos — leitura fresca por item,
 * coluna SQL da fila, coluna SQL do detalhe. Um erro de exclusao num deles deixa cada task verde sozinha e a tela
 * oferecendo o que a porta recusa. Os testes da T0-T2 (`separacaoTetoFisico`) provam cada regra num gesto; aqui:
 *
 *  I1 — o C169 do comeco ao fim pela rota: fila e detalhe 0, +2 recusado (S2), entrega 4, entrada 2, fila e detalhe
 *       2, separa 2, entrega 2 -> ENTREGUE, reserva CONSUMIDA.
 *  I2 — a caixa sem reserva e a aprovacao de outra (M3) pela rota, ate as duas ENTREGUE.
 *  I3 — pelo servico: separarRequisicao no M4 (4 + 4) lanca a S2 do 2o item sem gravar nada; listarFilaSeparacao e
 *       reservarItensAprovacao direto dizem o mesmo que as rotas no mesmo estado (C169, M4, M3).
 *  I4 — propriedade: em C1-C7, M2, M4 (cada item), M5, P4 e o decimal, fila = detalhe; a porta aceita o numero da
 *       fila e, num estado identico remontado, recusa o numero + delta com a S2 cujo `disponivel` e o
 *       `saldo_separavel` do detalhe (os tres caminhos contra a mesma literal).
 *  I5 — o P3 (B477): o detalhe e a segunda rodada da entrega concordam (entregavel 0, entregar 4 -> 400); a dona da
 *       caixa entrega; a outra e encerrada.
 *  I6 — a corrida separar x aprovar (B476): no UPDATE da separacao de R1 o ADMIN aprova R2 (gancho, 1 disparo); a
 *       aprovacao espera a trava por material e nao reserva a caixa de R1.
 *  A46 — controle positivo: cada consulta ACHA o seu estado (montado por escritor direto: a porta nao deixa mais
 *       produzi-lo) e nao acha os negativos; coluna trocada -> o banco recusa. Sem isso "A46 vazia" no fim das
 *       jornadas seria teste que nao sabe falhar.
 *
 * Usuarios: S sem perfil (PRODUCAO) cria pela rota e cancela; ADMIN superadmin aprova, encerra, da entrada solta
 * (movimentacoes/v2 ENTRADA — sem reserva) e faz a saida avulsa; ALMOX e ALMOX2 (ALMOXARIFE) separam e entregam.
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa95-separacao-limitada-ao-fisico.md (T4).
 *
 * Executar: cd server && node tests/api/separacaoTetoFisicoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 95T4', role: 'admin', is_superadmin: 1, email: 'a95t4@t.com' },
  S: { id: 9541, nome: 'Solic 95T4', role: 'user', email: 's95t4@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9542, nome: 'Almox 95T4', role: 'user', email: 'x95t4@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9543, nome: 'Almox2 95T4', role: 'user', email: 'y95t4@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
// Literais congeladas (plano, Contrato): S2 (forma inalterada; o `disponivel` e o teto, B471) e a da entrega.
const S2 = (nome, q, max, pend, disp) => `${nome}: não é possível separar ${q} PC. Máximo: ${max} (pendente: ${pend}, disponível: ${disp})`;
const ENT = (nome, q, max, pend, disp) => `${nome}: não é possível entregar ${q} PC. Máximo: ${max} (pendente: ${pend}, disponível: ${disp})`;
const RE_UPDATE_SEPARADO = /UPDATE itens_requisicao_almoxarifado SET quantidade_separada = \?/;
const arred = (x) => Math.round(Number(x) * 1e6) / 1e6;

// A46 (plano, "Letra A") — o texto das consultas sem mudar uma virgula (so sem o ';'); o teste filtra por material
// por fora.
const A46 = {
  a: `SELECT m.id AS material_id, m.codigo, m.quantidade_atual AS fisico,
  SUM(MAX(COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 0)) AS na_caixa,
  GROUP_CONCAT(r.numero || ' (' || r.status || ')', '; ') AS requisicoes
FROM itens_requisicao_almoxarifado ir
JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
JOIN materiais_almoxarifado m ON m.id = ir.material_id
WHERE COALESCE(r.ativo,1) = 1
  AND r.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                   'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
  AND COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) > 1e-9
GROUP BY m.id HAVING na_caixa > m.quantidade_atual + 1e-9 ORDER BY m.codigo`,
  b: `SELECT m.id AS material_id, m.codigo, m.quantidade_atual AS fisico, m.quantidade_reservada AS reservado_total,
  SUM(MAX(MAX(COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0), 0)
    - COALESCE((SELECT SUM(rs.quantidade - COALESCE(rs.quantidade_utilizada,0)) FROM reservas_material_almoxarifado rs
        WHERE rs.item_requisicao_id = ir.id AND rs.material_id = ir.material_id AND rs.status = 'ATIVA'
          AND rs.origem = 'REQUISICAO'), 0), 0)) AS caixa_sem_reserva
FROM itens_requisicao_almoxarifado ir
JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
JOIN materiais_almoxarifado m ON m.id = ir.material_id
WHERE COALESCE(r.ativo,1) = 1
  AND r.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                   'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
GROUP BY m.id
HAVING m.quantidade_reservada + caixa_sem_reserva > m.quantidade_atual - COALESCE(m.quantidade_bloqueada,0)
  - COALESCE(m.quantidade_em_inspecao,0) - COALESCE(m.quantidade_em_terceiros,0) + 1e-9
ORDER BY m.codigo`,
};

let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const comPrazo = (p, ms, rotulo) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`prazo de ${ms}ms estourado: ${rotulo}`)), ms).unref()),
]);
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  console.log('\n=== Etapa 95 (T4): integracao — a separacao limitada ao fisico, rota e servico ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (sem header: ADMIN) — molde da 92-94.
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

  // ── gancho no SQL (molde da 94): no 1o comando que casa, dispara o gesto e so emite o comando retido depois que
  //    o gesto termina OU o prazo de retencao passa (o gesto pode estar esperando a trava que este comando segura) ──
  const origRun = db.run.bind(db);
  let ganchos = [];
  db.run = function (sql, ...rest) {
    const s = String(sql);
    for (const g of ganchos) {
      if (g.armado && g.re.test(s)) {
        g.armado = false; g.disparos++;
        g.gesto = Promise.resolve().then(g.fn).then((r) => { g.resposta = r; return r; }, (e) => { g.erro = e; });
        g.promessa = Promise.race([g.gesto.then(() => 'gesto terminou'), espera(g.retencao).then(() => 'prazo de retencao')])
          .then((porque) => { g.liberadoPor = porque; return origRun(sql, ...rest); });
        return this;
      }
    }
    return origRun(sql, ...rest);
  };
  const armar = (re, fn, retencao = 400) => { const g = { re, fn, retencao, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };

  // ── fixtures pela porta de sempre; o livro-razao do teste (entradas e saidas avulsas por material) confere o saldo ──
  const nomes = new Map();
  const entrou = new Map();
  const material = async (fisico = 0) => {
    const c = `E95T4-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, 'PC', ?, 0, 1, 0, 0.1)`, [c, c, fisico])).lastID;
    nomes.set(id, c); entrou.set(id, fisico);
    return id;
  };
  const entrar = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e95t4' });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
    entrou.set(m, arred(entrou.get(m) + q));
  };
  const saidaAvulsa = async (m, q) => {
    const r = await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: m, tipo: 'SAIDA', quantidade: q, motivo: 'e95t4 saida avulsa', justificativa: 'consumo avulso da manutencao',
    });
    assert.strictEqual(r.status, 201, `saida avulsa: ${JSON.stringify(r.body)}`);
    entrou.set(m, arred(entrou.get(m) - q));
  };
  // S cria pela rota; itens: [[material, qtd], ...]
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-95T4',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const row = await dbGet(db, 'SELECT solicitante_id, status FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    assert.deepStrictEqual([Number(row.solicitante_id), row.status], [USERS.S.id, 'PENDENTE'], 'quem pediu foi S');
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    return { R: cr.body.id, ids, m: itens[0][0] };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    return r;
  };
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  const encerrar = (R) => como('ADMIN').put(`${API}/requisicoes/${R}/encerrar`, { motivo: 'e95t4' });
  const cancelar = (R) => como('S').put(`${API}/requisicoes/${R}/cancelar`, { motivo: 'e95t4 desisti' });
  const ok = (r, msg = '') => assert.ok(r.status === 200 || r.status === 201, `${msg}: ${r.status} ${JSON.stringify(r.body)}`);
  const recusa = (r, literal, msg = '') => {
    assert.strictEqual(r.status, 400, `${msg}: esperava 400, veio ${r.status} ${JSON.stringify(r.body)}`);
    if (literal) assert.strictEqual(r.body.error, literal, msg);
  };
  const status = async (R) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [R])).status;
  const item = (id) => dbGet(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE id=?', [id]);
  const reservaAtiva = async (R) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade - COALESCE(quantidade_utilizada,0)),0) q
    FROM reservas_material_almoxarifado WHERE requisicao_id=? AND status='ATIVA'`, [R])).q);
  const reservas = async (R) => (await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id=? ORDER BY id', [R]))
    .map((r) => r.status).join(',');
  const rodadas = async (R) => Number((await dbGet(db, 'SELECT COUNT(*) n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=?', [R])).n);

  // ── leituras pela rota ──
  const linhaDaFila = async (R) => {
    const r = await como('ALMOX').get(`${API}/fila-separacao`);
    assert.strictEqual(r.status, 200, `fila: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.find((l) => Number(l.id) === Number(R)) || null;
  };
  const naFila = async (R, itemId) => {
    const l = await linhaDaFila(R);
    assert.ok(l, `a requisicao ${R} nao esta na fila`);
    const it = l.itens.find((i) => Number(i.item_id) === Number(itemId));
    assert.ok(it, `o item ${itemId} nao esta na linha da fila`);
    return { etapas: l.etapas, separavel: it.separavel };
  };
  const detalhe = async (R) => {
    const d = await como('ALMOX').get(`${API}/requisicoes/${R}`);
    assert.strictEqual(d.status, 200, `detalhe: ${JSON.stringify(d.body)}`);
    return d.body;
  };
  const detalheItem = async (R, itemId) => (await detalhe(R)).itens.find((i) => Number(i.id) === Number(itemId));
  const saldo = async (m) => {
    const r = await como('ALMOX').get(`${API}/materiais/${m}`);
    assert.strictEqual(r.status, 200, `GET material: ${r.status} ${JSON.stringify(r.body)}`);
    // arredondado a 1e-6: o motor grava o fisico em ponto flutuante (0,3 - 0,1 sai 0.19999999999999998 na coluna —
    // medido no decimal do I4; e do motor, fora desta etapa, e a regua do modulo e 1e-6).
    return { q: arred(r.body.quantidade_atual), r: arred(r.body.quantidade_reservada || 0) };
  };
  const consultasA46 = async (m) => {
    const achou = {};
    for (const [nome, sql] of [['A46a', A46.a], ['A46b', A46.b]]) {
      // eslint-disable-next-line no-await-in-loop
      const linhas = await dbAll(db, `SELECT * FROM (${sql}) WHERE material_id = ?`, [m]);
      if (linhas.length) achou[nome] = linhas;
    }
    return achou;
  };
  /** O fim de toda jornada: saldo pela rota = entradas - saidas avulsas - entregue (livro do teste, nao a coluna),
   *  nada reservado, A46 vazia para o material. */
  const fecharMaterial = async (m, rotulo, qEsperado) => {
    const entregue = Number((await dbGet(db, `SELECT COALESCE(SUM(COALESCE(quantidade_entregue, quantidade_atendida, 0)),0) q
      FROM itens_requisicao_almoxarifado WHERE material_id=?`, [m])).q);
    const q = qEsperado === undefined ? arred(entrou.get(m) - entregue) : qEsperado;
    assert.deepStrictEqual(await saldo(m), { q, r: 0 }, `${rotulo}: saldo pela rota (entrou ${entrou.get(m)}, entregue ${entregue})`);
    const achou = await consultasA46(m);
    assert.deepStrictEqual(achou, {}, `${rotulo}: a A46 achou o material: ${JSON.stringify(achou)}`);
  };
  /** O ultimo gesto de uma requisicao: entrega o que o detalhe diz entregavel; depois ENTREGUE fica, PARCIALMENTE_
   *  ATENDIDA encerra (ADMIN), quem nao separou nada cancela (S). EM_SEPARACAO sem nada a entregar e a C174 — falha. */
  const CANCELAVEIS = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'];
  const fecharRequisicao = async (R, rotulo) => {
    let st = await status(R);
    if (['EM_SEPARACAO', 'PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA'].includes(st)) {
      const pares = (await detalhe(R)).itens.filter((i) => Number(i.quantidade_entregavel) > 1e-9)
        .map((i) => [i.id, Number(i.quantidade_entregavel)]);
      if (pares.length) ok(await entregar(R, pares), `${rotulo}: entregar o entregavel ${JSON.stringify(pares)}`);
      st = await status(R);
    }
    if (st === 'PARCIALMENTE_ATENDIDA') { ok(await encerrar(R), `${rotulo}: encerrar`); st = await status(R); }
    else if (CANCELAVEIS.includes(st)) { ok(await cancelar(R), `${rotulo}: cancelar`); st = await status(R); }
    assert.ok(['ENTREGUE', 'ENCERRADA', 'CANCELADO'].includes(st), `${rotulo}: R${R} terminou em ${st} (sem gesto limpo)`);
    return st;
  };

  // Cenarios-base (pede 6, fisico 4). Com reserva: a entrada vem ANTES da aprovacao (a aprovacao reserva).
  const comReserva = async (fisico = 4, pede = 6) => {
    const m = await material(0); await entrar(m, fisico);
    const a = await req([[m, pede]]); await aprovar(a.R);
    assert.strictEqual(await reservaAtiva(a.R), Math.min(fisico, pede), 'premissa: a aprovacao reservou');
    return { ...a, m };
  };
  // Sem reserva: aprovada sem estoque; o material chega solto depois.
  const semReserva = async (fisico = 4, pede = 6) => {
    const m = await material(0);
    const a = await req([[m, pede]]); await aprovar(a.R);
    await entrar(m, fisico);
    assert.strictEqual(await reservaAtiva(a.R), 0, 'premissa: sem reserva');
    return { ...a, m };
  };

  // ══════════════ I1 — o C169 do comeco ao fim, pela rota ══════════════
  await test('[95 T4 I1] C169 pela rota: S pede 6 (fisico 4), ADMIN aprova (reserva 4), ALMOX separa 4 -> fila 0 (AGUARDANDO_SALDO + ENTREGAR) e detalhe 0 (saldo_atual 4); +2 -> 400 S2; entrega 4 -> PARCIALMENTE_ATENDIDA, fisico 0, item 4/4; entrada 2 -> fila SEPARAR 2 e detalhe 2; separa 2, entrega 2 -> ENTREGUE, reserva CONSUMIDA; saldo q=0 r=0; A46 vazia', async () => {
    desarmar();
    const x = await comReserva(4, 6);
    const it = x.ids[0];
    ok(await separar(x.R, [[it, 4]]), 'I1: separar 4');
    let f = await naFila(x.R, it);
    let d = await detalheItem(x.R, it);
    assert.strictEqual(f.separavel, 0, `I1: fila separavel ${f.separavel} (etapas ${f.etapas})`);
    assert.ok(f.etapas.includes('AGUARDANDO_SALDO') && f.etapas.includes('ENTREGAR') && !f.etapas.includes('SEPARAR'), `I1: etapas ${JSON.stringify(f.etapas)}`);
    assert.deepStrictEqual([d.quantidade_separavel, d.saldo_atual], [0, 4], 'I1: detalhe');
    recusa(await separar(x.R, [[it, 2]]), S2(nomes.get(x.m), 2, 0, 2, 0), 'I1: +2');
    assert.strictEqual(await rodadas(x.R), 1, 'I1: a recusa nao gravou rodada');
    const e1 = await entregar(x.R, [[it, 4]]);
    ok(e1, 'I1: entregar 4');
    assert.strictEqual(await status(x.R), 'PARCIALMENTE_ATENDIDA');
    assert.deepStrictEqual(await saldo(x.m), { q: 0, r: 0 }, 'I1: fisico 0 depois da entrega');
    const i1 = await item(it);
    assert.deepStrictEqual([Number(i1.quantidade_separada), Number(i1.quantidade_entregue)], [4, 4], 'I1: item 4/4 (sem fantasma)');
    await entrar(x.m, 2);
    f = await naFila(x.R, it);
    d = await detalheItem(x.R, it);
    assert.ok(f.etapas.includes('SEPARAR'), `I1: etapas depois da entrada ${JSON.stringify(f.etapas)}`);
    assert.deepStrictEqual([f.separavel, d.quantidade_separavel], [2, 2], 'I1: fila/detalhe depois da entrada de 2');
    ok(await separar(x.R, [[it, 2]]), 'I1: separar 2');
    ok(await entregar(x.R, [[it, 2]]), 'I1: entregar 2');
    assert.strictEqual(await status(x.R), 'ENTREGUE');
    assert.strictEqual(await reservas(x.R), 'CONSUMIDA', 'I1: reserva');
    await fecharMaterial(x.m, 'I1', 0);
  });

  // ══════════════ I2 — a caixa sem reserva e a aprovacao de outra (M3), pela rota ══════════════
  await test('[95 T4 I2] M3 pela rota: R1 aprovada sem estoque, entrada 4, R1 separa 4; R2 criada e aprovada -> NENHUMA reserva; fila de R2 AGUARDANDO_SALDO; R2 separar 1 -> 400 S2; R1 entrega 4 -> ENTREGUE; entrada 4 -> fila de R2 SEPARAR 4; R2 separa 4, entrega 4 -> ENTREGUE; saldo q=0 r=0; A46 vazia', async () => {
    desarmar();
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    assert.strictEqual(await reservaAtiva(a.R), 0, 'premissa: R1 sem reserva');
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 'I2: R1 separa 4');
    const b = await req([[m, 4]]); await aprovar(b.R);
    assert.strictEqual(await reservaAtiva(b.R), 0, 'I2: a aprovacao de R2 reservou a caixa de R1');
    let f = await naFila(b.R, b.ids[0]);
    assert.deepStrictEqual([f.etapas, f.separavel], [['AGUARDANDO_SALDO'], 0], 'I2: fila de R2');
    recusa(await separar(b.R, [[b.ids[0], 1]]), S2(nomes.get(m), 1, 0, 4, 0), 'I2: R2 separar 1');
    const e = await entregar(a.R, [[a.ids[0], 4]]);
    ok(e, 'I2: a dona da caixa entrega');
    assert.strictEqual(await status(a.R), 'ENTREGUE');
    await entrar(m, 4);
    f = await naFila(b.R, b.ids[0]);
    assert.ok(f.etapas.includes('SEPARAR'), `I2: etapas de R2 ${JSON.stringify(f.etapas)}`);
    assert.strictEqual(f.separavel, 4, 'I2: separavel de R2 depois da entrada');
    ok(await separar(b.R, [[b.ids[0], 4]]), 'I2: R2 separa 4');
    ok(await entregar(b.R, [[b.ids[0], 4]]), 'I2: R2 entrega 4');
    assert.strictEqual(await status(b.R), 'ENTREGUE');
    await fecharMaterial(m, 'I2', 0);
  });

  // ══════════════ I3 — pelo servico ══════════════
  await test('[95 T4 I3] pelo servico: separarRequisicao(M4, 4 + 4) lanca 400 com a S2 do 2o item, nada gravado; listarFilaSeparacao direto = a linha da rota (M4 e C169); reservarItensAprovacao direto no M3 = a rota (0); cada requisicao ate o ultimo gesto pelo servico (entregar) e pela rota (encerrar/cancelar); saldos e A46 vazias', async () => {
    desarmar();
    const fila = async (R) => {
      const linhas = await requisitionService.listarFilaSeparacao(db, { ...USERS.ALMOX });
      return JSON.parse(JSON.stringify(linhas.find((l) => Number(l.id) === Number(R)) || null));
    };
    // M4: uma rodada, dois itens do mesmo material sem reserva, fisico 4
    const m4 = { m: await material(0) };
    const r4 = await req([[m4.m, 4], [m4.m, 4]]); await aprovar(r4.R);
    await entrar(m4.m, 4);
    assert.strictEqual(await reservaAtiva(r4.R), 0, "premissa: M4 sem reserva");
    let erro;
    try { await requisitionService.separarRequisicao(db, r4.R, [{ item_id: r4.ids[0], quantidade_separada: 4 }, { item_id: r4.ids[1], quantidade_separada: 4 }], { ...USERS.ALMOX }); } catch (e) { erro = e; }
    assert.ok(erro, 'I3: o servico aceitou 4 + 4 com 4 fisicos');
    assert.strictEqual(erro.status, 400, `I3: ${erro.status} ${erro.message}`);
    assert.strictEqual(erro.message, S2(nomes.get(m4.m), 4, 0, 4, 0));
    assert.deepStrictEqual(await Promise.all(r4.ids.map(async (i) => Number((await item(i)).quantidade_separada))), [0, 0], 'I3: nada separado');
    assert.strictEqual(await rodadas(r4.R), 0, 'I3: nenhuma rodada');
    let svc = await fila(r4.R);
    assert.ok(svc, 'I3: M4 fora da fila do servico');
    assert.deepStrictEqual(svc, await linhaDaFila(r4.R), 'I3: fila do servico = fila da rota (M4)');
    assert.deepStrictEqual(svc.itens.map((i) => i.separavel), [4, 4], 'I3: cada item mostra o seu teto (nao dividido na linha)');
    // ate o ultimo gesto: 2 + 2 e entrega pelo servico, encerrar pela rota
    const sep = await requisitionService.separarRequisicao(db, r4.R, [{ item_id: r4.ids[0], quantidade_separada: 2 }, { item_id: r4.ids[1], quantidade_separada: 2 }], { ...USERS.ALMOX });
    assert.strictEqual(sep.status, 'EM_SEPARACAO');
    const ent = await requisitionService.entregarRequisicao(db, r4.R, [{ item_id: r4.ids[0], quantidade_atendida: 2 }, { item_id: r4.ids[1], quantidade_atendida: 2 }], { ...USERS.ALMOX });
    assert.strictEqual(ent.status, 'PARCIALMENTE_ATENDIDA');
    ok(await encerrar(r4.R), 'I3: encerrar o M4');
    assert.strictEqual(await status(r4.R), 'ENCERRADA');
    await fecharMaterial(m4.m, 'I3 M4', 0);

    // C169 (o estado do I1): fila do servico = rota
    const c = await comReserva(4, 6);
    await requisitionService.separarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_separada: 4 }], { ...USERS.ALMOX });
    svc = await fila(c.R);
    assert.deepStrictEqual(svc, await linhaDaFila(c.R), 'I3: fila do servico = fila da rota (C169)');
    assert.deepStrictEqual([svc.itens[0].separavel, (await detalheItem(c.R, c.ids[0])).quantidade_separavel], [0, 0], 'I3: C169 0 no servico e no detalhe');
    const entC = await requisitionService.entregarRequisicao(db, c.R, [{ item_id: c.ids[0], quantidade_atendida: 4 }], { ...USERS.ALMOX });
    assert.strictEqual(entC.status, 'PARCIALMENTE_ATENDIDA');
    ok(await encerrar(c.R), 'I3: encerrar o C169');
    assert.strictEqual(await reservas(c.R), 'CONSUMIDA');
    await fecharMaterial(c.m, 'I3 C169', 0);

    // M3 (o estado do I2): R2a aprovada pela rota, R2b pelo servico — os dois reservam 0
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    await requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], { ...USERS.ALMOX });
    const b1 = await req([[m, 4]]); const b2 = await req([[m, 4]]);
    await aprovar(b1.R);
    const out = await requisitionService.reservarItensAprovacao(db, b2.R, { ...USERS.ADMIN }, { numero: 'E95T4-M3' });
    assert.deepStrictEqual([await reservaAtiva(b1.R), out.reservas], [0, []], 'I3: rota e servico no M3');
    assert.strictEqual(out.status, null, 'I3: o servico nao escolhe status de reserva');
    const entA = await requisitionService.entregarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_atendida: 4 }], { ...USERS.ALMOX });
    assert.strictEqual(entA.status, 'ENTREGUE', 'I3: a dona da caixa entrega pelo servico');
    ok(await cancelar(b1.R), 'I3: cancelar R2a');
    ok(await cancelar(b2.R), 'I3: cancelar R2b (PENDENTE)');
    await fecharMaterial(m, 'I3 M3', 0);
  });

  // ══════════════ I4 — a fila nunca oferece o que a porta recusa (propriedade) ══════════════
  // Cada estado: montar() -> { m, R, item, outros: [R...] }; delta acima do separavel; repor: entrada antes de fechar
  // (P4: a saida avulsa levou o que a caixa de R1 precisava — o motor nao conhece caixa, B466 iv).
  const estados = [
    { nome: 'C1', montar: async () => { const x = await comReserva(); ok(await separar(x.R, [[x.ids[0], 4]])); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 0 },
    { nome: 'C2', montar: async () => { const x = await comReserva(); ok(await separar(x.R, [[x.ids[0], 3]])); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 1 },
    { nome: 'C3', montar: async () => { const x = await comReserva(); await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada=4 WHERE id=?', [x.ids[0]]); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 0 },
    { nome: 'C4', montar: async () => { const x = await semReserva(); ok(await separar(x.R, [[x.ids[0], 4]])); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 0 },
    { nome: 'C5', montar: async () => { const x = await comReserva(); ok(await separar(x.R, [[x.ids[0], 4]])); ok(await entregar(x.R, [[x.ids[0], 2]])); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 0 },
    { nome: 'C6', montar: async () => { const x = await comReserva(); ok(await separar(x.R, [[x.ids[0], 4]])); await entrar(x.m, 1); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 1 },
    { nome: 'C7', montar: async () => { const x = await semReserva(); ok(await separar(x.R, [[x.ids[0], 2]])); return { m: x.m, R: x.R, item: x.ids[0] }; }, esperado: 2 },
    { nome: 'M2', montar: async () => {
      const m = await material(0);
      const a = await req([[m, 4]]); await aprovar(a.R); const b = await req([[m, 4]]); await aprovar(b.R);
      await entrar(m, 4); ok(await separar(a.R, [[a.ids[0], 4]]));
      return { m, R: b.R, item: b.ids[0], outros: [a.R] };
    }, esperado: 0 },
    ...[0, 1].map((k) => ({ nome: `M4 (item ${k + 1})`, montar: async () => {
      const m = await material(0);
      const a = await req([[m, 4], [m, 4]]); await aprovar(a.R); await entrar(m, 4);
      return { m, R: a.R, item: a.ids[k] };
    }, esperado: 4 })),
    { nome: 'M5', montar: async () => {
      const m = await material(0);
      const a = await req([[m, 4], [m, 4]]); await aprovar(a.R); await entrar(m, 4);
      ok(await separar(a.R, [[a.ids[0], 4]]));
      return { m, R: a.R, item: a.ids[1] };
    }, esperado: 0 },
    { nome: 'P4', montar: async () => {
      const m = await material(0);
      const a = await req([[m, 4]]); await aprovar(a.R); await entrar(m, 4); ok(await separar(a.R, [[a.ids[0], 4]]));
      await entrar(m, 4);
      const c = await req([[m, 4]]); await aprovar(c.R);
      assert.strictEqual(await reservaAtiva(c.R), 4, 'premissa P4: R3 reservou 4');
      await saidaAvulsa(m, 4);
      return { m, R: c.R, item: c.ids[0], outros: [a.R] };
    }, esperado: 4, repor: { aceito: 4 } },
    { nome: 'decimal', montar: async () => {
      const m = await material(0);
      const a = await req([[m, 0.1]]); await aprovar(a.R); const b = await req([[m, 0.3]]); await aprovar(b.R);
      await entrar(m, 0.3); ok(await separar(a.R, [[a.ids[0], 0.1]]));
      return { m, R: b.R, item: b.ids[0], outros: [a.R] };
    }, esperado: 0.2, delta: 0.1 },
  ];

  await test('[95 T4 I4] propriedade: em C1-C7, M2, M4 (cada item), M5, P4 e decimal, fila = detalhe = o esperado; a porta aceita o numero da fila e, no estado remontado, recusa numero + delta com a S2 cujo disponivel e o saldo_separavel do detalhe; cada estado ate o ultimo gesto, saldo e A46 vazia', async () => {
    desarmar();
    const erros = [];
    const conferir = (nome, cond, msg) => { if (!cond) erros.push(`${nome}: ${msg}`); };
    for (const e of estados) {
      const delta = e.delta || 1;
      for (const variante of ['aceito', 'recusado']) {
        // eslint-disable-next-line no-await-in-loop
        const x = await e.montar();
        // eslint-disable-next-line no-await-in-loop
        const f = await naFila(x.R, x.item);
        // eslint-disable-next-line no-await-in-loop
        const d = await detalheItem(x.R, x.item);
        conferir(`${e.nome}/${variante}`, f.separavel === d.quantidade_separavel && f.separavel === e.esperado,
          `fila ${f.separavel}, detalhe ${d.quantidade_separavel}, esperado ${e.esperado}`);
        conferir(`${e.nome}/${variante}`, (f.separavel > 1e-9) === f.etapas.includes('SEPARAR'), `etapas ${JSON.stringify(f.etapas)} com separavel ${f.separavel}`);
        if (variante === 'aceito') {
          if (f.separavel > 1e-9) {
            // eslint-disable-next-line no-await-in-loop
            const s = await separar(x.R, [[x.item, f.separavel]]);
            conferir(`${e.nome}/aceito`, s.status === 200, `separar ${f.separavel} -> ${s.status} ${JSON.stringify(s.body)}`);
          }
        } else {
          const q = arred(f.separavel + delta);
          const pend = arred(Number(d.quantidade_solicitada) - Number(d.quantidade_separada));
          // eslint-disable-next-line no-await-in-loop
          const s = await separar(x.R, [[x.item, q]]);
          const literal = S2(nomes.get(x.m), q, f.separavel, pend, d.saldo_separavel);
          conferir(`${e.nome}/recusado`, s.status === 400 && s.body.error === literal,
            `separar ${q} -> ${s.status} ${JSON.stringify(s.body)} (esperava 400 "${literal}")`);
        }
        const repor = e.repor && e.repor[variante];
        // eslint-disable-next-line no-await-in-loop
        if (repor) await entrar(x.m, repor);
        for (const R of [x.R, ...(x.outros || [])]) {
          // eslint-disable-next-line no-await-in-loop
          await fecharRequisicao(R, `${e.nome}/${variante} R${R}`);
        }
        // eslint-disable-next-line no-await-in-loop
        await fecharMaterial(x.m, `${e.nome}/${variante}`);
      }
    }
    assert.deepStrictEqual(erros, [], erros.join(' | '));
  });

  // ══════════════ I5 — o detalhe e a segunda rodada da entrega concordam (P3, B477) ══════════════
  await test('[95 T4 I5] P3 pela rota: R2 (pede 6, reserva 2, separa 2, entrega 2) e R1 (sem reserva, entrada 4, separa 4) -> detalhe de R2 quantidade_entregavel 0; R2 entregar 4 -> 400; R1 entrega 4 -> ENTREGUE; R2 continua com entregavel 0 e o ADMIN a encerra -> ENCERRADA; saldo q=0 r=0; A46 vazia', async () => {
    desarmar();
    const m = await material(2);
    const b = await req([[m, 6]]); await aprovar(b.R);
    assert.strictEqual(await reservaAtiva(b.R), 2, 'premissa: R2 reservou 2');
    ok(await separar(b.R, [[b.ids[0], 2]]), 'I5: R2 separa 2'); ok(await entregar(b.R, [[b.ids[0], 2]]), 'I5: R2 entrega 2');
    assert.strictEqual(await status(b.R), 'PARCIALMENTE_ATENDIDA', 'premissa');
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    ok(await separar(a.R, [[a.ids[0], 4]]), 'I5: R1 separa 4');
    assert.strictEqual((await detalheItem(b.R, b.ids[0])).quantidade_entregavel, 0, 'I5: o detalhe de R2 oferece a caixa de R1');
    recusa(await entregar(b.R, [[b.ids[0], 4]]), ENT(nomes.get(m), 4, 0, 4, 4), 'I5: a segunda rodada de R2');
    ok(await entregar(a.R, [[a.ids[0], 4]]), 'I5: R1 entrega a propria caixa');
    assert.strictEqual(await status(a.R), 'ENTREGUE');
    assert.strictEqual((await detalheItem(b.R, b.ids[0])).quantidade_entregavel, 0, 'I5: R2 sem fisico');
    ok(await encerrar(b.R), 'I5: encerrar R2');
    assert.strictEqual(await status(b.R), 'ENCERRADA');
    assert.deepStrictEqual(await Promise.all([a.ids[0], b.ids[0]].map(async (i) => Number((await item(i)).quantidade_entregue))), [4, 2]);
    await fecharMaterial(m, 'I5', 0);
  });

  // ══════════════ I6 — a corrida separar x aprovar (B476), pela rota, com gancho ══════════════
  await test('[95 T4 I6] corrida: R1 sem reserva (fisico 4) separa 4; no UPDATE da separacao (gancho, 1 disparo) o ADMIN aprova R2 -> a aprovacao espera a trava por material (o comando sai pelo prazo de retencao), 200, NENHUMA reserva; R1 entrega 4 -> ENTREGUE; entrada 4, R2 separa 4 e entrega 4 -> ENTREGUE; saldo q=0 r=0; A46 vazia', async () => {
    desarmar();
    const m = await material(0);
    const a = await req([[m, 4]]); await aprovar(a.R);
    await entrar(m, 4);
    const b = await req([[m, 4]]);
    const g = armar(RE_UPDATE_SEPARADO, () => como('ADMIN').put(`${API}/requisicoes/${b.R}/aprovar`, {}));
    let s;
    try { s = await comPrazo(separar(a.R, [[a.ids[0], 4]]), 10000, 'separacao de R1'); } finally { desarmar(); }
    await g.promessa;
    await comPrazo(g.gesto, 10000, 'aprovacao de R2');
    assert.strictEqual(g.disparos, 1, `I6: o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
    assert.ok(!g.erro, g.erro && g.erro.message);
    ok(s, 'I6: R1 separa 4');
    assert.strictEqual(g.resposta.status, 200, `I6: aprovar R2 ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
    assert.strictEqual(await reservaAtiva(b.R), 0, `I6: a aprovacao de R2 reservou a caixa de R1 (comando liberado por: ${g.liberadoPor})`);
    assert.strictEqual(g.liberadoPor, 'prazo de retencao', 'I6: a aprovacao terminou antes do UPDATE da separacao (sem trava por material)');
    ok(await entregar(a.R, [[a.ids[0], 4]]), 'I6: a dona da caixa entrega');
    assert.strictEqual(await status(a.R), 'ENTREGUE');
    await entrar(m, 4);
    ok(await separar(b.R, [[b.ids[0], 4]]), 'I6: R2 separa 4');
    ok(await entregar(b.R, [[b.ids[0], 4]]), 'I6: R2 entrega 4');
    assert.strictEqual(await status(b.R), 'ENTREGUE');
    await fecharMaterial(m, 'I6', 0);
  });

  // ══════════════ A46 — controle positivo ══════════════
  await test('[95 T4 A46] controle: (a) acha C169 e M2, (b) acha C169, M2 e M3 (estados por escritor direto — a porta nao os produz mais); N1 (caixa coberta pela reserva), N2 (caixa sem reserva com fisico de sobra), N3 (tudo entregue) em nenhuma; coluna trocada -> o banco recusa', async () => {
    desarmar();
    const SEP = 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada=? WHERE id=?';
    // C169: reserva 4 de 6, separou 4 pela rota; o legado separou mais 2
    const p1 = await comReserva(4, 6); ok(await separar(p1.R, [[p1.ids[0], 4]]));
    await dbRun(db, SEP, [6, p1.ids[0]]);
    // M2: R1 separou os 4 pela rota; R2 (o legado da D (60)) separou os mesmos 4
    const m2 = await material(0);
    const a2 = await req([[m2, 4]]); await aprovar(a2.R); const b2 = await req([[m2, 4]]); await aprovar(b2.R);
    await entrar(m2, 4); ok(await separar(a2.R, [[a2.ids[0], 4]]));
    await dbRun(db, SEP, [4, b2.ids[0]]);
    // M3: R2 aprovada reservou os 4; o legado separou os mesmos 4 em R1 (sem reserva)
    const m3 = await material(0);
    const a3 = await req([[m3, 4]]); await aprovar(a3.R); await entrar(m3, 4);
    const b3 = await req([[m3, 4]]); await aprovar(b3.R);
    assert.strictEqual(await reservaAtiva(b3.R), 4, 'premissa M3: R2 reservou 4');
    await dbRun(db, SEP, [4, a3.ids[0]]);
    // negativos
    const n1 = await comReserva(4, 4); ok(await separar(n1.R, [[n1.ids[0], 4]]));
    const n2 = await semReserva(10, 4); ok(await separar(n2.R, [[n2.ids[0], 4]]));
    const n3 = await comReserva(4, 4); ok(await separar(n3.R, [[n3.ids[0], 4]])); ok(await entregar(n3.R, [[n3.ids[0], 4]]));
    const esperado = { C169: ['A46a', 'A46b'], M2: ['A46a', 'A46b'], M3: ['A46b'], N1: [], N2: [], N3: [] };
    const casos = { C169: p1.m, M2: m2, M3: m3, N1: n1.m, N2: n2.m, N3: n3.m };
    const erros = [];
    for (const [nome, m] of Object.entries(casos)) {
      // eslint-disable-next-line no-await-in-loop
      const achou = await consultasA46(m);
      if (JSON.stringify(Object.keys(achou)) !== JSON.stringify(esperado[nome])) erros.push(`${nome}: ${JSON.stringify(Object.keys(achou))} (esperado ${JSON.stringify(esperado[nome])})`);
    }
    assert.deepStrictEqual(erros, [], erros.join(' | '));
    // os numeros da linha: (a) C169 na caixa 6 com fisico 4; (b) M3 reservado 4 + caixa sem reserva 4 com fisico 4
    const c169 = (await consultasA46(p1.m)).A46a[0];
    assert.deepStrictEqual([Number(c169.na_caixa), Number(c169.fisico)], [6, 4], 'A46 (a) no C169');
    const lm3 = (await consultasA46(m3)).A46b[0];
    assert.deepStrictEqual([Number(lm3.reservado_total), Number(lm3.caixa_sem_reserva), Number(lm3.fisico)], [4, 4, 4], 'A46 (b) no M3');
    // coluna trocada de proposito: o banco recusa as duas (a consulta nao passa vazia por erro de nome)
    for (const [l, sql] of Object.entries(A46)) {
      let recusou = null;
      // eslint-disable-next-line no-await-in-loop
      try { await dbAll(db, sql.replace(/quantidade_separada/g, 'quantidade_separadaX')); } catch (e) { recusou = e; }
      assert.ok(recusou && /no such column/i.test(recusou.message), `A46 (${l}) com coluna trocada: ${recusou && recusou.message}`);
    }
  });

  terminou = true;
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
