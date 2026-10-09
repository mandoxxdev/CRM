/**
 * Etapa 94 — a alcada de valor vale ate o comeco da separacao (C68 da 47, "fica de fora" da 93).
 *
 * Antes, `verificarBloqueioLiberacao` reavaliava a alcada em qualquer status separavel/entregavel e gravava
 * AGUARDANDO_APROVACAO_VALOR com material na caixa ou ja entregue (Fase 0, sonda 1: 5/7 por gatilho; sonda 2:
 * 7/8 por origem). Aprovar devolvia *Reservada* com entregue; reprovar/cancelar soltavam a reserva do material
 * separado. Agora a alcada so e reavaliada quando o status tem seta para AGUARDANDO_APROVACAO_VALOR na maquina
 * (os cinco pre-separacao e a EM_SEPARACAO vazia — B454/B462) E nenhum item tem nada separado nem entregue
 * (B453). Depois disso a verificacao nao le o custo nem grava nada (B455).
 *
 * Usuarios reais por header (molde 92/93): S sem perfil (PRODUCAO) cria e cancela; ADMIN superadmin aprova
 * pela rota e muda custo/configuracao; ADMIN2 (id 2, unico aprovador de valor) aprova/reprova por valor;
 * ALMOX (ALMOXARIFE) separa, libera e entrega. Material comum, custo 1, pede 4 -> valor R$ 4,00; alcada
 * ligada com limite R$ 10,00 (exceto onde dito).
 *
 * T0: RN-01, RN-02, RN-03. T1: RN-04 (a gravacao da alcada confere o status lido — gancho no SQL que DISPARA o
 * cancelamento e o aguarda: os cancelamentos ficam fora da trava por requisicao, nao ha deadlock). T2 a RN-05.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa94-alcada-de-valor-ate-a-separacao.md
 *
 * Executar: cd server && node tests/api/alcadaValorDepoisDaSeparacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const maquina = require('../../services/almoxarifado/requisitionStateMachine');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 94', role: 'admin', is_superadmin: 1, email: 'a94@t.com' },
  ADMIN2: { id: 2, nome: 'Adm2 94', role: 'admin', is_superadmin: 1, email: 'b94@t.com' },
  S: { id: 9401, nome: 'Solic 94', role: 'user', email: 's94@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9402, nome: 'Almox 94', role: 'user', email: 'x94@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
// Literais congeladas (plano, Contrato).
const V403B = /^Valor total \(R\$\s?[\d.,]+\) excede o limite de liberação automática \(R\$\s?[\d.,]+\)\. Aprovação de alto valor necessária\.$/;
const PRE_SEPARACAO = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'];
const SEIS = [...PRE_SEPARACAO, 'EM_SEPARACAO'];
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Espiao de notificarAprovadoresValor pelo objeto do modulo (I3: a T0 faz a chamada passar por ele).
const notificados = [];
valueApprovalService.notificarAprovadoresValor = async (db, req) => { notificados.push(Number(req && req.id)); };
const notificacoesDe = (R) => notificados.filter((id) => id === Number(R)).length;

(async () => {
  console.log('\n=== Etapa 94: a alcada de valor vale ate o comeco da separacao ===\n');
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

  // ── gancho no SQL (T1): dispara o gesto concorrente, AGUARDA a resposta, so entao emite o comando retido.
  // Pode aguardar: os dois cancelamentos ficam fora da trava por requisicao (B450) — a 93 so proibe aguardar
  // no gancho um gesto travado da mesma requisicao.
  const origRun = db.run.bind(db);
  let ganchos = [];
  db.run = function (sql, ...rest) {
    const sq = String(sql);
    for (const g of ganchos) {
      if (g.armado && g.re.test(sq)) {
        g.armado = false; g.disparos++;
        Promise.resolve().then(g.fn).then((r) => { g.resposta = r; }, (e) => { g.erro = e; })
          .then(() => origRun(sql, ...rest));
        return this;
      }
    }
    return origRun(sql, ...rest);
  };
  const armar = (re, fn) => { const g = { re, fn, disparos: 0, armado: true }; ganchos.push(g); return g; };
  const desarmar = () => { ganchos = []; };

  // ── configuracao da alcada (escritor direto no setup; os gatilhos usam as rotas) ──
  const config = async ({ ativo = 1, limite = 10 } = {}) => {
    for (const [k, v] of [['liberacao_valor_ativo', String(ativo)], ['liberacao_valor_limite', String(limite)],
      ['liberacao_valor_aprovadores', '[2]']]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    }
  };
  const lerConfig = async (k) => (await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [k]))?.valor;

  const separar = (k, x, q) => como(k).put(`${API}/requisicoes/${x.R}/separar`,
    { itens_separados: q ? [{ item_id: x.item, quantidade_separada: q }] : [] });
  const liberar = (k, x) => como(k).put(`${API}/requisicoes/${x.R}/liberar-retirada`);
  const entregar = (k, x, q) => como(k).put(`${API}/requisicoes/${x.R}/entregar`,
    { itens_atendidos: [{ item_id: x.item, quantidade_atendida: q }] });
  const ok = (r, rotulo) => assert.ok(r.status === 200 || r.status === 201, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);

  // estado: RESERVADA | EM_SEPARACAO | PRONTA | PARCIAL. Material comum, custo 1, pede 4 -> valor 4.
  const montar = async (estado = 'RESERVADA', { pede = 4, estoque = 8, aprovar = true } = {}) => {
    const c = `E94T-${++seq}`;
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico, custo_unitario)
      VALUES (?, ?, 'PC', ?, 0, 1, 0, 1)`, [c, `Mat ${c}`, estoque])).lastID;
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-94', itens: [{ material_id: m, quantidade: pede }],
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const R = cr.body.id;
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=?', [R])).id;
    const x = { m, R, item };
    if (!aprovar) return x;
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    ok(ap, 'aprovar');
    if (estado === 'RESERVADA') return x;
    ok(await separar('ALMOX', x, 4), 'separar 4');
    if (estado === 'PRONTA') ok(await liberar('ALMOX', x), 'liberar');
    if (estado === 'PARCIAL') ok(await entregar('ALMOX', x, 2), 'entregar 2');
    return x;
  };
  const foto = async (x) => {
    const rq = await dbGet(db, `SELECT status, valor_total, requer_aprovacao_valor rav, data_aprovacao_valor
      FROM requisicoes_almoxarifado WHERE id=?`, [x.R]);
    const it = await dbGet(db, `SELECT COALESCE(quantidade_separada,0) sep, COALESCE(quantidade_entregue,0) ent
      FROM itens_requisicao_almoxarifado WHERE id=?`, [x.item]);
    const rv = await dbAll(db, 'SELECT status FROM reservas_material_almoxarifado WHERE requisicao_id=? ORDER BY id', [x.R]);
    return { ...rq, sep: Number(it.sep), ent: Number(it.ent), reservas: rv.map((r) => r.status).join(',') };
  };

  // Gatilhos, todos por rota real (ADMIN superadmin). O PUT da configuracao responde 500 no harness
  // (`getConfigForApi` consulta `usuarios`, que o harness nao cria) mas GRAVA antes — o caso "A1" da rota:
  // o teste afirma o EFEITO lendo configuracoes_almoxarifado, nao o codigo da resposta.
  const GATILHOS = {
    entrada: async (x) => ok(await como('ADMIN').post(`${API}/movimentacoes/v2`, {
      material_id: x.m, tipo: 'ENTRADA', quantidade: 1, custo_unitario: 1000, motivo: 'nota cara 94' }), 'entrada cara'),
    cadastro: async (x) => ok(await como('ADMIN').put(`${API}/materiais/${x.m}`, { custo_unitario: 1000 }), 'custo do cadastro'),
    limite: async () => {
      await como('ADMIN').put(`${API}/configuracoes/liberacao-valor`, { ativo: true, limite: 1, aprovadorIds: [2] });
      assert.strictEqual(Number(await lerConfig('liberacao_valor_limite')), 1, 'premissa: o PUT da configuracao gravou o limite');
    },
    ligar: async () => {
      await como('ADMIN').put(`${API}/configuracoes/liberacao-valor`, { ativo: true, limite: 1, aprovadorIds: [2] });
      assert.ok(['1', 'true'].includes(String(await lerConfig('liberacao_valor_ativo'))), 'premissa: o PUT ligou a alcada');
    },
  };
  // Os seis gestos pos-separacao e o desfecho normal de cada um.
  const GESTOS = [
    { estado: 'EM_SEPARACAO', nome: 'entregar 2', fn: (x) => entregar('ALMOX', x, 2), status: 'PARCIALMENTE_ATENDIDA' },
    { estado: 'EM_SEPARACAO', nome: 'separar vazio', fn: (x) => separar('ALMOX', x, 0), status: 'EM_SEPARACAO' },
    { estado: 'EM_SEPARACAO', nome: 'liberar', fn: (x) => liberar('ALMOX', x), status: 'PRONTA_PARA_RETIRADA' },
    { estado: 'PRONTA', nome: 'entregar 2', fn: (x) => entregar('ALMOX', x, 2), status: 'PARCIALMENTE_ATENDIDA' },
    { estado: 'PARCIAL', nome: 'entregar 2', fn: (x) => entregar('ALMOX', x, 2), status: 'ENTREGUE', reserva: 'CONSUMIDA' },
    { estado: 'PARCIAL', nome: 'separar vazio', fn: (x) => separar('ALMOX', x, 0), status: 'EM_SEPARACAO' },
  ];

  // ── RN-01 (a) — matriz: quatro gatilhos por rota x seis gestos pos-separacao ──
  for (const [gat, disparar] of Object.entries(GATILHOS)) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[94 RN-01] (a) gatilho "${gat}" depois da separacao: os seis gestos -> 200 com o desfecho normal, valor_total e requer_aprovacao_valor iguais, nenhuma notificacao`, async () => {
      const erros = [];
      try {
        for (const g of GESTOS) {
          // alcada desligada ate o gesto no "ligar"; ligada com limite 10 nos outros
          // eslint-disable-next-line no-await-in-loop
          await config(gat === 'ligar' ? { ativo: 0, limite: 10 } : { ativo: 1, limite: 10 });
          // eslint-disable-next-line no-await-in-loop
          const x = await montar(g.estado);
          // eslint-disable-next-line no-await-in-loop
          await disparar(x);
          // eslint-disable-next-line no-await-in-loop
          const antes = await foto(x);
          // eslint-disable-next-line no-await-in-loop
          const r = await g.fn(x);
          // eslint-disable-next-line no-await-in-loop
          const depois = await foto(x);
          const rotulo = `${g.estado}/${g.nome}`;
          if (r.status !== 200) erros.push(`${rotulo}: ${r.status} ${JSON.stringify(r.body)} (status ${depois.status})`);
          else if (depois.status !== g.status) erros.push(`${rotulo}: status ${depois.status} (esperado ${g.status})`);
          if (g.reserva && depois.reservas !== g.reserva) erros.push(`${rotulo}: reservas ${depois.reservas}`);
          if (Number(depois.valor_total) !== Number(antes.valor_total)) erros.push(`${rotulo}: valor_total ${antes.valor_total} -> ${depois.valor_total}`);
          if (Number(depois.rav || 0) !== Number(antes.rav || 0)) erros.push(`${rotulo}: requer_aprovacao_valor ${antes.rav} -> ${depois.rav}`);
          if (notificacoesDe(x.R) !== 0) erros.push(`${rotulo}: ${notificacoesDe(x.R)} notificacao(oes) aos aprovadores`);
        }
      } finally { await config({ ativo: 1, limite: 10 }); }
      assert.deepStrictEqual(erros, [], erros.join(' | '));
    });
  }

  // ── RN-01 (b) — pelo servico: a verificacao direta nos tres status com caixa ──
  await test('[94 RN-01] (b) pelo servico: verificarBloqueioLiberacao direto em EM_SEPARACAO (com caixa), PRONTA e PARCIALMENTE_ATENDIDA com o custo alto -> devolve a linha, status e valor_total inalterados', async () => {
    await config({ ativo: 1, limite: 10 });
    for (const [estado, esperado] of [['EM_SEPARACAO', 'EM_SEPARACAO'], ['PRONTA', 'PRONTA_PARA_RETIRADA'], ['PARCIAL', 'PARCIALMENTE_ATENDIDA']]) {
      // eslint-disable-next-line no-await-in-loop
      const x = await montar(estado);
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_unitario = 1000 WHERE id = ?', [x.m]);
      // eslint-disable-next-line no-await-in-loop
      const antes = await foto(x);
      let linha; let erro;
      // eslint-disable-next-line no-await-in-loop
      try { linha = await valueApprovalService.verificarBloqueioLiberacao(db, x.R); } catch (e) { erro = e; }
      assert.ok(!erro, `${estado}: lancou ${erro && erro.status} ${erro && erro.message}`);
      assert.strictEqual(linha && Number(linha.id), Number(x.R), `${estado}: nao devolveu a linha`);
      // eslint-disable-next-line no-await-in-loop
      const depois = await foto(x);
      assert.strictEqual(depois.status, esperado, `${estado}: status ${depois.status}`);
      assert.strictEqual(Number(depois.valor_total), Number(antes.valor_total), `${estado}: valor_total ${antes.valor_total} -> ${depois.valor_total}`);
      assert.strictEqual(notificacoesDe(x.R), 0, `${estado}: notificou`);
    }
  });

  // ── RN-02 (a) — antes da separacao, como hoje: os seis status sem caixa ──
  // Como cada status e produzido (Fase 2, M5): TOTALMENTE/PARCIALMENTE_RESERVADA e AGUARDANDO_ESTOQUE/COMPRA
  // pela rota /aprovar (estoque 8 / 2 / 0 / 0 com solicitacao de compra PENDENTE por escritor direto);
  // APROVADO por ESCRITOR DIRETO (o /aprovar com disponivel reserva e devolve *_RESERVADA — APROVADO estavel
  // nao sai de rota nenhuma hoje); EM_SEPARACAO vazia por "Iniciar Separacao" sem quantidade com o valor
  // abaixo do limite.
  const produzir = async (status) => {
    if (status === 'TOTALMENTE_RESERVADA') return montar('RESERVADA');
    if (status === 'PARCIALMENTE_RESERVADA') return montar('RESERVADA', { estoque: 2 });
    if (status === 'AGUARDANDO_ESTOQUE') return montar('RESERVADA', { estoque: 0 });
    if (status === 'AGUARDANDO_COMPRA') {
      const x = await montar('RESERVADA', { estoque: 0, aprovar: false });
      await dbRun(db, "INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status) VALUES (?,?,'ESTOQUE_MINIMO','PENDENTE')", [x.m, 4]);
      ok(await como('ADMIN').put(`${API}/requisicoes/${x.R}/aprovar`, {}), 'aprovar');
      return x;
    }
    if (status === 'APROVADO') {
      const x = await montar('RESERVADA', { aprovar: false });
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'APROVADO', aprovador_id = 1, data_aprovacao = CURRENT_TIMESTAMP WHERE id = ?", [x.R]);
      return x;
    }
    if (status === 'EM_SEPARACAO') {
      const x = await montar('RESERVADA');
      ok(await separar('ALMOX', x, 0), 'iniciar separacao vazia');
      return x;
    }
    throw new Error(`status sem produtor: ${status}`);
  };
  for (const st of SEIS) {
    for (const depois of ['aprovar-valor', 'rejeitar-valor', 'cancelar']) {
      // eslint-disable-next-line no-await-in-loop
      await test(`[94 RN-02] (a) ${st} sem caixa, valor acima do limite: separar -> 403 V403b, AGUARDANDO_APROVACAO_VALOR, reserva intacta, 1 notificacao; daqui ${depois}`, async () => {
        await config({ ativo: 1, limite: 10 });
        const x = await produzir(st);
        try {
          const f0 = await foto(x);
          assert.strictEqual(f0.status, st, `premissa: produziu ${f0.status}`);
          assert.strictEqual(f0.sep + f0.ent, 0, 'premissa: nada na caixa');
          await config({ ativo: 1, limite: 1 });
          const s = await separar('ALMOX', x, 0);
          assert.strictEqual(s.status, 403, `separar: ${s.status} ${JSON.stringify(s.body)}`);
          assert.match(s.body.error, V403B);
          const f1 = await foto(x);
          assert.strictEqual(f1.status, 'AGUARDANDO_APROVACAO_VALOR');
          assert.strictEqual(f1.reservas, f0.reservas, `reserva mexida: ${f0.reservas} -> ${f1.reservas}`);
          assert.strictEqual(notificacoesDe(x.R), 1, `notificado ${notificacoesDe(x.R)} vez(es)`);
          if (depois === 'aprovar-valor') {
            const a = await como('ADMIN2').put(`${API}/requisicoes/${x.R}/aprovar-valor`, {});
            assert.strictEqual(a.status, 200, `aprovar-valor: ${a.status} ${JSON.stringify(a.body)}`);
            const f2 = await foto(x);
            assert.ok(!['AGUARDANDO_APROVACAO_VALOR', 'PENDENTE'].includes(f2.status), `status ${f2.status}`);
            const ativas = f2.reservas.split(',').filter((r) => r === 'ATIVA').length;
            assert.ok(ativas <= 1, `reservas ${f2.reservas} (duplicada)`);
            if (f0.reservas.includes('ATIVA')) assert.strictEqual(ativas, 1, `reservas ${f2.reservas}`);
          } else if (depois === 'rejeitar-valor') {
            const r = await como('ADMIN2').put(`${API}/requisicoes/${x.R}/rejeitar-valor`, { motivo: 'caro 94' });
            assert.strictEqual(r.status, 200, `rejeitar-valor: ${r.status} ${JSON.stringify(r.body)}`);
            const f2 = await foto(x);
            assert.strictEqual(f2.status, 'REJEITADO');
            assert.ok(!f2.reservas.includes('ATIVA'), `reservas ${f2.reservas}`);
          } else {
            const c = await como('S').put(`${API}/requisicoes/${x.R}/cancelar`, { motivo: 'desisti 94' });
            assert.strictEqual(c.status, 200, `cancelar: ${c.status} ${JSON.stringify(c.body)}`);
            const f2 = await foto(x);
            assert.strictEqual(f2.status, 'CANCELADO');
            assert.ok(!f2.reservas.includes('ATIVA'), `reservas ${f2.reservas}`);
          }
        } finally { await config({ ativo: 1, limite: 10 }); }
      });
    }
  }

  // ── RN-02 (b)(b') — pre-separacao COM caixa (legado montado por escritor direto): a caixa vence o status ──
  await test('[94 RN-02] (b) legado TOTALMENTE_RESERVADA com 4 separados e 2 entregues, limite 1 -> separar vazio 200 EM_SEPARACAO, sem 403, sem notificacao', async () => {
    await config({ ativo: 1, limite: 10 });
    const x = await montar('PARCIAL');
    try {
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'TOTALMENTE_RESERVADA' WHERE id = ?", [x.R]);
      await config({ ativo: 1, limite: 1 });
      const s = await separar('ALMOX', x, 0);
      assert.strictEqual(s.status, 200, `separar vazio: ${s.status} ${JSON.stringify(s.body)}`);
      assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
      assert.strictEqual(notificacoesDe(x.R), 0);
    } finally { await config({ ativo: 1, limite: 10 }); }
  });
  await test("[94 RN-02] (b') legado TOTALMENTE_RESERVADA com SO separado (2, entregue 0), limite 1 -> separar vazio 200 EM_SEPARACAO (a regua nao e so o entregue)", async () => {
    await config({ ativo: 1, limite: 10 });
    const x = await montar('RESERVADA');
    try {
      ok(await separar('ALMOX', x, 2), 'separar 2');
      await dbRun(db, "UPDATE requisicoes_almoxarifado SET status = 'TOTALMENTE_RESERVADA' WHERE id = ?", [x.R]);
      const f0 = await foto(x);
      assert.strictEqual(f0.sep, 2); assert.strictEqual(f0.ent, 0);
      await config({ ativo: 1, limite: 1 });
      const s = await separar('ALMOX', x, 0);
      assert.strictEqual(s.status, 200, `separar vazio: ${s.status} ${JSON.stringify(s.body)}`);
      assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
    } finally { await config({ ativo: 1, limite: 10 }); }
  });

  // ── RN-02 (c) — ja aprovada por valor nunca volta (guarda de regressao) ──
  await test('[94 RN-02] (c) TOTALMENTE_RESERVADA ja aprovada por valor (data_aprovacao_valor), limite 1 -> separar 4 200, sem notificacao', async () => {
    await config({ ativo: 1, limite: 10 });
    const x = await montar('RESERVADA');
    try {
      await dbRun(db, 'UPDATE requisicoes_almoxarifado SET data_aprovacao_valor = CURRENT_TIMESTAMP WHERE id = ?', [x.R]);
      await config({ ativo: 1, limite: 1 });
      const s = await separar('ALMOX', x, 4);
      assert.strictEqual(s.status, 200, `separar: ${s.status} ${JSON.stringify(s.body)}`);
      assert.strictEqual((await foto(x)).status, 'EM_SEPARACAO');
      assert.strictEqual(notificacoesDe(x.R), 0);
    } finally { await config({ ativo: 1, limite: 10 }); }
  });

  // ── RN-03 — a maquina diz onde a alcada vale ──
  await test('[94 RN-03] validarTransicao(s, AGUARDANDO_APROVACAO_VALOR).ok exatamente em PENDENTE + os seis; alcadaDeValorAindaVale(s, []) exatamente nos seis; com caixa, em nenhum', async () => {
    const todos = [...new Set([...Object.keys(maquina.TRANSICOES), 'AGUARDANDO_APROVACAO_VALOR', 'REJEITADO', 'CANCELADO', 'ENCERRADA'])];
    const comSeta = todos.filter((s) => maquina.validarTransicao(s, 'AGUARDANDO_APROVACAO_VALOR').ok).sort();
    assert.deepStrictEqual(comSeta, ['PENDENTE', ...SEIS].sort());
    assert.strictEqual(typeof maquina.alcadaDeValorAindaVale, 'function', 'alcadaDeValorAindaVale nao existe na maquina');
    const vale = todos.filter((s) => maquina.alcadaDeValorAindaVale(s, [])).sort();
    assert.deepStrictEqual(vale, [...SEIS].sort());
    for (const caixa of [{ quantidade_separada: 1 }, { quantidade_entregue: 1 }, { quantidade_entregue: null, quantidade_atendida: 1 }]) {
      const comCaixa = todos.filter((s) => maquina.alcadaDeValorAindaVale(s, [{ quantidade_separada: 0 }, caixa]));
      assert.deepStrictEqual(comCaixa, [], `com ${JSON.stringify(caixa)}: ${comCaixa}`);
    }
  });

  // ── RN-04 — a gravacao da alcada confere o status lido (T1, B456) ──
  const RE_ALCADA = /SET\s+status\s*=\s*\?,\s*requer_aprovacao_valor\s*=\s*1/;
  const V1 = (st) => `A requisição mudou de status enquanto a alçada de valor era conferida (agora ${st}); recarregue e confira antes de separar.`;
  const AV1 = 'Apenas requisições aguardando aprovação de valor podem ser liberadas';
  const A43A = `SELECT rq.id FROM requisicoes_almoxarifado rq
    JOIN auditoria_log_almoxarifado a ON a.entidade = 'requisicao' AND a.entidade_id = rq.id AND a.acao = 'CANCELAMENTO'
    WHERE rq.status <> 'CANCELADO' AND COALESCE(rq.ativo, 1) = 1 AND rq.id = ? GROUP BY rq.id`;
  const CANCELAR = {
    almoxarifado: (x) => como('S').put(`${API}/requisicoes/${x.R}/cancelar`, { motivo: 'desisti 94' }),
    'outros modulos': (x) => como('S').put(`/api/requisicoes-material/${x.R}/cancelar`, {}),
  };
  for (const [via, cancelar] of Object.entries(CANCELAR)) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[94 RN-04] (${via === 'almoxarifado' ? 'a' : 'b'}) separar x cancelar (${via}) no UPDATE da alcada: cancelamento 200, separacao 409 V1 "agora CANCELADO", final CANCELADO, reserva LIBERADA, 0 rodadas, nenhuma notificacao; /aprovar-valor 400 AV1 sem reserva nova; A43 (a) vazia`, async () => {
      await config({ ativo: 1, limite: 10 });
      const x = await montar('RESERVADA');
      let s; let g;
      try {
        await config({ ativo: 1, limite: 1 });
        g = armar(RE_ALCADA, () => cancelar(x));
        s = await separar('ALMOX', x, 4);
      } finally { desarmar(); await config({ ativo: 1, limite: 10 }); }
      assert.strictEqual(g.disparos, 1, `o gancho disparou ${g.disparos} vez(es) — rodada sem valor`);
      assert.ok(!g.erro, g.erro && g.erro.message);
      assert.strictEqual(g.resposta.status, 200, `cancelar: ${g.resposta.status} ${JSON.stringify(g.resposta.body)}`);
      const f = await foto(x);
      assert.strictEqual(f.status, 'CANCELADO', `status final ${f.status}`);
      assert.strictEqual(s.status, 409, `separar: ${s.status} ${JSON.stringify(s.body)}`);
      assert.strictEqual(s.body.error, V1('CANCELADO'));
      assert.strictEqual(f.reservas, 'LIBERADA', `reservas ${f.reservas}`);
      const rodadas = (await dbGet(db, 'SELECT COUNT(*) n FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?', [x.R])).n;
      assert.strictEqual(Number(rodadas), 0, `${rodadas} rodada(s)`);
      assert.strictEqual(notificacoesDe(x.R), 0, `notificado ${notificacoesDe(x.R)} vez(es)`);
      const a = await como('ADMIN2').put(`${API}/requisicoes/${x.R}/aprovar-valor`, {});
      assert.strictEqual(a.status, 400, `aprovar-valor: ${a.status} ${JSON.stringify(a.body)}`);
      assert.strictEqual(a.body.error, AV1);
      assert.strictEqual((await foto(x)).reservas, 'LIBERADA', 'reserva nova depois do aprovar-valor');
      assert.deepStrictEqual(await dbAll(db, A43A, [x.R]), [], 'A43 (a) lista a requisicao (ressuscitada)');
    });
  }
  await test('[94 RN-04] (c) sem gancho: Promise.all separar x cancelar (almoxarifado), d=0, N=10 -> 0/10 em AGUARDANDO_APROVACAO_VALOR sobre cancelamento 200', async () => {
    let errados = 0; const ex = [];
    try {
      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await config({ ativo: 1, limite: 10 });
        // eslint-disable-next-line no-await-in-loop
        const x = await montar('RESERVADA');
        // eslint-disable-next-line no-await-in-loop
        await config({ ativo: 1, limite: 1 });
        // eslint-disable-next-line no-await-in-loop
        const [, c] = await Promise.all([separar('ALMOX', x, 4),
          new Promise((r) => setTimeout(r, 0)).then(() => CANCELAR.almoxarifado(x))]);
        // eslint-disable-next-line no-await-in-loop
        const f = await foto(x);
        if (c.status === 200 && f.status !== 'CANCELADO') { errados++; ex.push(f.status); }
      }
    } finally { await config({ ativo: 1, limite: 10 }); }
    assert.strictEqual(errados, 0, `${errados}/10 com cancelamento 200 e status ${ex.join(',')}`);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
