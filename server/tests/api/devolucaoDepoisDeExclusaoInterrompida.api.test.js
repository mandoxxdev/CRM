/**
 * Etapa 271 (C553) — a devolucao depois de uma exclusao interrompida conta o que a exclusao ja devolveu.
 *
 * A exclusao da requisicao credita uma ENTRADA por linha da saida (Etapa 259) e nao tem transacao: uma falha inesperada no meio
 * deixa as primeiras ENTRADAs gravadas com a requisicao ativa. A nova exclusao pula o que ja entrou (B1609), mas a Devolucao citando
 * a saida nao via essas ENTRADAs: A 3, B 5, entrega de 6, a 2a ENTRADA falha (A volta 3), Devolucao de 6 -> 201, excluir de novo ->
 * nada a devolver, fisico 11 (o certo: 8). RN-271.01..06 no plano.
 *
 * Plano: docs/superpowers/plans/2026-11-27-almoxarifado-etapa271-devolucao-depois-de-exclusao-interrompida.md
 * Executar: cd server && node tests/api/devolucaoDepoisDeExclusaoInterrompida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 271', role: 'admin', is_superadmin: 1, email: 'a271@t.com' },
  ALMOX: { id: 27101, nome: 'Almox 271', role: 'user', email: 'x271@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n=== Etapa 271: a devolucao depois de uma exclusao interrompida (C553) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  app.use((req, res, next) => { const k = req.headers['x-u']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  stack.splice(stack.findIndex((l) => l.name === 'jsonParser') + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-u', k),
    post: (u, b = {}) => request(app).post(u).set('x-u', k).send(b),
    put: (u, b = {}) => request(app).put(u).set('x-u', k).send(b),
    del: (u, b = {}) => request(app).delete(u).set('x-u', k).send(b),
  });
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM271T', nome: 'A271T' });
  const loc = async (codigo) => {
    await como('ADMIN').post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A271T'); const B = await loc('B271T'); const P = await loc('P271T');
  let seq = 0;
  const material = async ({ padrao = A.id, serie = 0 } = {}) => {
    const c = `DEX271-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,?,0,?,1)`,
    [c, c, serie, padrao])).lastID;
  };
  const v2 = (b) => como('ADMIN').post(`${API}/movimentacoes/v2`, { motivo: 'teste 271', justificativa: 'teste 271', ...b });
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const soma = async (m) => Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id=?',
    [m])).q);
  const entrar = async (m, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `entrada de premissa: ${JSON.stringify(r.body)}`);
  };
  const sid = async (m, numero) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id=? AND numero=?', [m, numero])).id;
  const novaReq = async (m, q, status = 'APROVADO') => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S',?)`, [`R271T-${++seq}`, status])).lastID;
    const item = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    return { R, item };
  };
  /** Separa q e entrega em `vezes` (cada parte uma saida), pela rota. Devolve a requisicao e as saidas em ordem. */
  const entregaReal = async (m, q, vezes = [q]) => {
    const { R, item } = await novaReq(m, q);
    const sep = await como('ALMOX').put(`${API}/requisicoes/${R}/separacao`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(sep.status, 200, `separacao de premissa: ${JSON.stringify(sep.body)}`);
    for (const v of vezes) {
      // eslint-disable-next-line no-await-in-loop
      const ent = await como('ALMOX').put(`${API}/requisicoes/${R}/entregar`, { itens_atendidos: [{ item_id: item, quantidade_atendida: v }] });
      assert.strictEqual(ent.status, 200, `entrega de premissa: ${JSON.stringify(ent.body)}`);
    }
    const saidas = (await dbAll(db, "SELECT id FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA' ORDER BY id", [R]))
      .map((s) => s.id);
    return { R, saidas };
  };
  /** Saida pelo motor com series (grava o registro das linhas) ligada a requisicao, como no exclusaoDevolvePrateleira. */
  const entregaPelaSaida = async (m, q, extra = {}) => {
    const { R, item } = await novaReq(m, q, 'ENTREGUE');
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada=?, quantidade_entregue=?, quantidade_atendida=? WHERE id=?',
      [q, q, q, item]);
    const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: q, ...extra });
    assert.strictEqual(s.status, 201, `saida de premissa: ${JSON.stringify(s.body)}`);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [R, s.body.id]);
    return { R, saida: s.body.id };
  };
  /** A n-esima ENTRADA da exclusao falha (a falha inesperada no meio). */
  const comFalhaNaEntrada = async (n, fn) => {
    const original = stockService.registrarMovimentacao;
    let chamadas = 0;
    stockService.registrarMovimentacao = async (...args) => {
      if (args[2] && args[2].tipo === 'ENTRADA' && /^Estorno exclusão/.test(args[2].motivo || '') && ++chamadas === n) {
        throw new Error('falha forcada 271');
      }
      return original(...args);
    };
    try { return await fn(); } finally { stockService.registrarMovimentacao = original; }
  };
  const excluirInterrompida = async (R, n = 2) => {
    const r = await comFalhaNaEntrada(n, () => como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'teste 271' }));
    assert.notStrictEqual(r.status, 200, `a falha forcada nao falhou: ${JSON.stringify(r.body)}`);
    const ativa = await dbGet(db, 'SELECT COALESCE(ativo,1) a FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(Number(ativa.a), 1, 'premissa: a requisicao continua ativa');
  };
  const excluir = async (R) => {
    const r = await como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'teste 271' });
    assert.strictEqual(r.status, 200, `exclusao: ${JSON.stringify(r.body)}`);
  };
  const devolver = (m, saida, quantidade, extra = {}) => como('ADMIN').post(`${API}/devolucoes`, {
    material_id: m, quantidade, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saida, localizacao_id: P.id, ...extra });
  const elegivel = async (m, saida) => {
    const r = await como('ADMIN').get(`${API}/devolucoes/saidas-elegiveis?material_id=${m}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.find((s) => s.id === saida);
  };

  // ── RN-271.01: o cenario medido do C553 ───────────────────────────────────────────────────────────────────────────────
  await test('[RN-271.01] A 3, B 5, entrega de 6, a exclusao para depois de devolver A: Devolucao de 6 -> 400 (antes: 201, fisico 11)',
    async () => {
      const m = await material();
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const { R, saidas: [saida] } = await entregaReal(m, 6);
      await excluirInterrompida(R);
      assert.strictEqual(await fis(m), 5, 'premissa: a exclusao devolveu 3 de A');
      const dv = await devolver(m, saida, 6);
      assert.strictEqual(dv.status, 400, `a devolucao aceitou o que a exclusao ja devolveu: ${JSON.stringify(dv.body)}`);
      assert.strictEqual(dv.body.error, `Devolução acima do entregue: a saída ${saida} entregou 6, já foram devolvidos 0, 3 já voltaram `
        + 'ao estoque pela exclusão interrompida da requisição e restam 3');
      assert.strictEqual(await fis(m), 5, 'a recusa mexeu no estoque');
      const n = await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE movimentacao_saida_id = ?', [saida]);
      assert.strictEqual(Number(n.n), 0, 'a recusa gravou a devolucao');
    });

  await test('[RN-271.01/02] o mesmo, devolvendo os 3 que faltam -> 201; excluir de novo -> fisico 8, A 3, B 5 (o certo)', async () => {
    const m = await material();
    await entrar(m, 3);
    await entrar(m, 5, { localizacao_destino_id: B.id });
    const { R, saidas: [saida] } = await entregaReal(m, 6);
    await excluirInterrompida(R);
    const dv = await devolver(m, saida, 3, { localizacao_id: B.id });
    assert.strictEqual(dv.status, 201, JSON.stringify(dv.body));
    assert.strictEqual(await fis(m), 8);
    await excluir(R);
    assert.strictEqual(await fis(m), 8, 'a nova exclusao creditou de novo');
    assert.strictEqual(await soma(m), 8);
  });

  // ── RN-271.03: a lista das entregas devolviveis ──────────────────────────────────────────────────────────────────────
  await test('[RN-271.03] a lista das entregas diz devolvivel 3 e quanto voltou pela exclusao (antes: 6); sem exclusao: 0 e devolvivel 6',
    async () => {
      const m = await material();
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const { R, saidas: [saida] } = await entregaReal(m, 6);
      const antes = await elegivel(m, saida);
      assert.strictEqual(antes.saldo_devolvivel, 6, 'metade positiva: sem exclusao a entrega toda e devolvivel');
      assert.strictEqual(Number(antes.quantidade_exclusao), 0);
      await excluirInterrompida(R);
      const s = await elegivel(m, saida);
      assert.strictEqual(s.saldo_devolvivel, 3);
      assert.strictEqual(Number(s.quantidade_exclusao), 3);
    });

  // ── RN-271.04: duas entregas — o que a exclusao devolveu e de cada saida, na ordem dela ─────────────────────────────────
  await test('[RN-271.04] entregas de 2 e 4, a exclusao para na 2a: a 1a nao devolve nada, a 2a devolve 4; excluir de novo -> fisico 8',
    async () => {
      const m = await material();
      await entrar(m, 8);
      const { R, saidas: [s1, s2] } = await entregaReal(m, 6, [2, 4]);
      await excluirInterrompida(R);
      assert.strictEqual(await fis(m), 4, 'premissa: a exclusao devolveu a 1a entrega (2)');
      assert.strictEqual((await elegivel(m, s1)).saldo_devolvivel, 0);
      assert.strictEqual((await elegivel(m, s2)).saldo_devolvivel, 4, 'a 2a entrega nao voltou e tem de continuar devolvivel');
      const d1 = await devolver(m, s1, 1);
      assert.strictEqual(d1.status, 400, `a 1a entrega devolveu de novo: ${JSON.stringify(d1.body)}`);
      assert.strictEqual(d1.body.error, `Devolução acima do entregue: a saída ${s1} entregou 2, já foram devolvidos 0, 2 já voltaram `
        + 'ao estoque pela exclusão interrompida da requisição e restam 0');
      const d2 = await devolver(m, s2, 4);
      assert.strictEqual(d2.status, 201, JSON.stringify(d2.body));
      await excluir(R);
      assert.strictEqual(await fis(m), 8);
    });

  await test('[RN-271.04] devolucao de 1 da 1a entrega ANTES da exclusao interrompida: a 1a fica sem nada, a 2a com 4 (fisico 8 no fim)',
    async () => {
      const m = await material();
      await entrar(m, 8);
      const { R, saidas: [s1, s2] } = await entregaReal(m, 6, [2, 4]);
      const d0 = await devolver(m, s1, 1);
      assert.strictEqual(d0.status, 201, JSON.stringify(d0.body));
      await excluirInterrompida(R);
      assert.strictEqual(await fis(m), 4, 'premissa: devolucao 1 + exclusao 1 (o que faltava da 1a)');
      const e1 = await elegivel(m, s1);
      assert.strictEqual(e1.saldo_devolvivel, 0);
      assert.strictEqual(Number(e1.quantidade_exclusao), 1, 'a exclusao devolveu so o liquido da 1a');
      assert.strictEqual((await elegivel(m, s2)).saldo_devolvivel, 4);
      await excluir(R);
      assert.strictEqual(await fis(m), 8);
    });

  // ── RN-271.05: com serie, a volta ja e contada pela serie — nao conta duas vezes ──────────────────────────────────────
  await test('[RN-271.05] S1 S2 em A, S3 S4 em B, saida das 4, a exclusao para depois de A: devolver S3 S4 -> 201 (nao conta A em dobro)',
    async () => {
      const m = await material({ serie: 1 });
      await entrar(m, 2, { series: ['S1', 'S2'] });
      await entrar(m, 2, { series: ['S3', 'S4'], localizacao_destino_id: B.id });
      const ids = [];
      for (const n of ['S1', 'S2', 'S3', 'S4']) ids.push(await sid(m, n)); // eslint-disable-line no-await-in-loop
      const { R, saida } = await entregaPelaSaida(m, 4, { serie_ids: ids });
      await excluirInterrompida(R);
      assert.strictEqual(await fis(m), 2, 'premissa: a exclusao devolveu S1 S2');
      const e = await elegivel(m, saida);
      assert.strictEqual(e.saldo_devolvivel, 2, `a lista contou em dobro: ${JSON.stringify(e)}`);
      assert.strictEqual(Number(e.quantidade_exclusao), 0, 'a volta com serie ja e contada como reentrada');
      const dv = await devolver(m, saida, 2, { series: ['S3', 'S4'], localizacao_id: B.id });
      assert.strictEqual(dv.status, 201, JSON.stringify(dv.body));
      assert.strictEqual(await fis(m), 4);
    });

  // ── RN-271.06: a mesma conta na gravacao e dentro da trava (corridas) ─────────────────────────────────────────────────
  await test('[RN-271.06a] a exclusao interrompida entre a validacao e a gravacao da devolucao: a gravacao recusa (fisico 5, nao 11)',
    async () => {
      const m = await material();
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const { R, saidas: [saida] } = await entregaReal(m, 6);
      // Gancho: segura o INSERT da devolucao (depois da validacao) ate o teste mandar; so sinaliza e espera.
      const runOriginal = db.run;
      let chegou = false; let solta;
      const portao = new Promise((r) => { solta = r; });
      db.run = function (sql, ...rest) {
        if (typeof sql === 'string' && /INSERT INTO devolucoes_material_almoxarifado/.test(sql) && !chegou) {
          chegou = true;
          portao.then(() => runOriginal.call(this, sql, ...rest));
          return this;
        }
        return runOriginal.call(this, sql, ...rest);
      };
      let dv;
      try {
        const pDv = devolver(m, saida, 6).then((r) => { dv = r; });
        for (let i = 0; i < 200 && !chegou; i++) await espera(10); // eslint-disable-line no-await-in-loop
        assert.ok(chegou, 'o gancho do INSERT da devolucao nao disparou');
        // do contexto do TESTE (nao do gancho): a exclusao interrompida
        await excluirInterrompida(R);
        solta();
        await pDv;
      } finally { db.run = runOriginal; solta(); }
      assert.strictEqual(dv.status, 400, `a gravacao aceitou: ${JSON.stringify(dv.body)}`);
      assert.match(dv.body.error, /3 já voltaram ao estoque pela exclusão interrompida da requisição e restam 3$/);
      assert.strictEqual(await fis(m), 5);
    });

  await test('[RN-271.06b] a exclusao interrompida enquanto a devolucao espera a trava (depois de gravar a linha): recusa dentro da trava',
    async () => {
      const m = await material();
      await entrar(m, 3);
      await entrar(m, 5, { localizacao_destino_id: B.id });
      const { R, saidas: [saida] } = await entregaReal(m, 6);
      // Gancho na exclusao: a 1a ENTRADA espera o teste (dentro das travas da exclusao); a 2a falha.
      const original = stockService.registrarMovimentacao;
      let chamadas = 0; let chegou = false; let solta;
      const portao = new Promise((r) => { solta = r; });
      stockService.registrarMovimentacao = async (...args) => {
        if (args[2] && args[2].tipo === 'ENTRADA' && /^Estorno exclusão/.test(args[2].motivo || '')) {
          chamadas++;
          if (chamadas === 1) { chegou = true; await portao; }
          if (chamadas === 2) throw new Error('falha forcada 271');
        }
        return original(...args);
      };
      let dv; let ex;
      try {
        const pEx = como('ADMIN').del(`${API}/requisicoes/${R}`, { justificativa: 'teste 271' }).then((r) => { ex = r; });
        for (let i = 0; i < 200 && !chegou; i++) await espera(10); // eslint-disable-line no-await-in-loop
        assert.ok(chegou, 'o gancho da exclusao nao disparou');
        // do contexto do TESTE: a devolucao valida e grava a linha (fora da trava) e para na trava do material
        const pDv = devolver(m, saida, 6).then((r) => { dv = r; });
        let linha = null;
        for (let i = 0; i < 200 && !linha; i++) { // eslint-disable-line no-await-in-loop
          await espera(10); // eslint-disable-line no-await-in-loop
          linha = await dbGet(db, 'SELECT id FROM devolucoes_material_almoxarifado WHERE movimentacao_saida_id = ?', [saida]); // eslint-disable-line no-await-in-loop
        }
        assert.ok(linha, 'a devolucao nao chegou a gravar a linha (premissa da corrida)');
        solta();
        await pEx; await pDv;
      } finally { stockService.registrarMovimentacao = original; solta(); }
      assert.notStrictEqual(ex.status, 200, `premissa: a exclusao era para falhar: ${JSON.stringify(ex.body)}`);
      assert.strictEqual(dv.status, 400, `a devolucao creditou dentro da trava: ${JSON.stringify(dv.body)} fisico ${await fis(m)}`);
      assert.strictEqual(dv.body.error, `A saída ${saida} mudou enquanto a devolução era gravada — nada foi gravado. Tente de novo.`);
      const n = await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE movimentacao_saida_id = ?', [saida]);
      assert.strictEqual(Number(n.n), 0, 'a linha da devolucao recusada ficou');
      assert.strictEqual(await fis(m), 5, 'fisico');
      assert.strictEqual(await soma(m), 5);
    });

  // ── Fase 2 (achados 2 e 5): dois materiais, e a saida antiga sem serie ao lado da com serie ───────────────────────────────
  /** Uma requisicao com uma saida por material (pelo motor, ligada a requisicao), na ordem dada. */
  const reqComSaidas = async (lista) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?,1,'S','ENTREGUE')`, [`R271T-${++seq}`])).lastID;
    const saidas = [];
    for (const { m, q, extra = {} } of lista) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
        quantidade_entregue, quantidade_atendida) VALUES (?,?,?,?,?,?)`, [R, m, q, q, q, q]);
      const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: q, ...extra }); // eslint-disable-line no-await-in-loop
      assert.strictEqual(s.status, 201, `saida de premissa: ${JSON.stringify(s.body)}`);
      await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET requisicao_id = ? WHERE id = ?', [R, s.body.id]); // eslint-disable-line no-await-in-loop
      saidas.push(s.body.id);
    }
    return { R, saidas };
  };
  await test('[RN-271.01, Fase 2 achado 5] dois materiais: M1 volta inteiro, a 1a ENTRADA de M2 falha -> M1 nao devolve, M2 devolve 4',
    async () => {
      const m1 = await material(); const m2 = await material();
      await entrar(m1, 5); await entrar(m2, 5);
      const { R, saidas: [s1, s2] } = await reqComSaidas([{ m: m1, q: 3 }, { m: m2, q: 4 }]);
      await excluirInterrompida(R, 2);
      assert.strictEqual(await fis(m1), 5, 'premissa: M1 voltou'); assert.strictEqual(await fis(m2), 1, 'premissa: M2 nao');
      const d1 = await devolver(m1, s1, 1);
      assert.strictEqual(d1.status, 400, `M1 devolveu de novo: ${JSON.stringify(d1.body)}`);
      assert.match(d1.body.error, /3 já voltaram ao estoque pela exclusão interrompida da requisição e restam 0$/);
      assert.strictEqual((await elegivel(m2, s2)).saldo_devolvivel, 4);
      const d2 = await devolver(m2, s2, 4);
      assert.strictEqual(d2.status, 201, JSON.stringify(d2.body));
      await excluir(R);
      assert.strictEqual(await fis(m1), 5); assert.strictEqual(await fis(m2), 5);
    });

  await test('[RN-271.05, Fase 2 achado 2] material com serie: 1a saida com S1 S2, 2a antiga sem serie (2); a exclusao para depois das duas '
    + '-> a antiga nao devolve de novo (antes do achado: devolvivel 2)', async () => {
    const m = await material({ serie: 1 });
    const outro = await material();
    await entrar(m, 4, { series: ['S1', 'S2', 'S3', 'S4'] });
    await entrar(outro, 5);
    const { R, saidas: [s1, s2] } = await reqComSaidas([
      { m, q: 2, extra: { serie_ids: [await sid(m, 'S1'), await sid(m, 'S2')] } },
      { m, q: 2, extra: { serie_ids: [await sid(m, 'S3'), await sid(m, 'S4')] } },
      { m: outro, q: 1 },
    ]);
    // a 2a saida vira "antiga": sem o vinculo das series (dado de antes do registro das series por saida)
    await dbRun(db, "UPDATE series_almoxarifado SET movimentacao_saida_id = NULL, status = 'BAIXADA' WHERE movimentacao_saida_id = ?", [s2]);
    await excluirInterrompida(R, 3); // as duas de m entram (uma com serie, uma sem); a do outro material falha
    assert.strictEqual(await fis(m), 4, 'premissa: as duas saidas de m voltaram');
    const e2 = await elegivel(m, s2);
    assert.strictEqual(e2.saldo_devolvivel, 0, `a saida antiga ficou devolvivel: ${JSON.stringify(e2)}`);
    const d2 = await devolver(m, s2, 1);
    assert.strictEqual(d2.status, 400, `a antiga devolveu de novo: ${JSON.stringify(d2.body)}`);
    assert.strictEqual((await elegivel(m, s1)).saldo_devolvivel, 0, 'metade positiva: a com serie ja voltou pelas series');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
