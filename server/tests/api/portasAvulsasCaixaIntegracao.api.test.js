/**
 * Etapa 97 (T3) — integracao: as portas avulsas respeitam a caixa sem reserva, pela ROTA e pelo SERVICO, cada jornada
 * ate o ultimo gesto do documento (B491-B498).
 *
 * Cada porta certa sozinha (T1, T2) nao prova o fluxo: a regua nova podia recusar a ENTREGA, o passo seguinte do mesmo
 * documento — foi o que a s5 da Fase 0 achou no contrato que a 96 propunha. Aqui o documento vai ate o fim: separar ->
 * tentar levar por cada porta -> entregar -> a caixa some -> a porta volta a passar; e cruza a T1 (motor) com a T2
 * (bloqueio, remessa, sucateamento, inventario). A trava (B494) depende de FIACAO (`AsyncLocalStorage`): so a corrida
 * pela rota E pelo servico prova que a porta avulsa espera a separacao e que a entrega, chamando o motor de dentro da
 * propria secao, nao espera a si mesma.
 *
 * Cenarios: (1) a jornada pela rota, porta por porta, e a entrega; (2) a corrida porta avulsa x separacao, pelo servico
 * e pela rota, com gancho de 1 disparo por rodada, e a entrega dentro da secao; (3) RN-06, o caso legitimo (material
 * perdido da caixa: entregar o que sobrou + encerrar; o administrador exclui); (4) a s5 inteira pela rota (RN-03), com o
 * legado montado por escritor direto (declarado) e a consulta A48 como controle positivo. A A48 (letra A, consulta
 * para producao) roda aqui com o texto do plano: vazia depois de cada porta recusada, e acha o legado do cenario 4.
 *
 * Usuarios reais por header (molde 92-96): S sem perfil (PRODUCAO) cria; ADMIN superadmin aprova, movimenta, conclui,
 * encerra e exclui; ALMOX e ALMOX2 (ALMOXARIFE) separam e entregam. `requirePermission` real (testApp).
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md (T3)
 * Executar: cd server && node tests/api/portasAvulsasCaixaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const { STATUS_COM_CAIXA } = require('../../services/almoxarifado/requisitionStateMachine');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 97i', role: 'admin', is_superadmin: 1, email: 'a97i@t.com' },
  S: { id: 9711, nome: 'Solic 97i', role: 'user', email: 's97i@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 9712, nome: 'Almox 97i', role: 'user', email: 'x97i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
  ALMOX2: { id: 9713, nome: 'Almox2 97i', role: 'user', email: 'y97i@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });
const comPrazo = (p, ms) => Promise.race([Promise.resolve(p).then(() => 'resolveu'), dormir(ms).then(() => 'PRESO')]);

// Literais do plano ("Literais"): S e as recusas de cada porta.
const S_FIM = ' e só saem pela entrega (material perdido da caixa: entregue o que existe e encerre a requisição, ou peça '
  + 'ao administrador do almoxarifado para excluí-la)';
const S = (c, lista) => ` — ${c} PC estão separados para ${lista}${S_FIM}`;
const M1 = (n) => `Saldo insuficiente. Disponível: ${n} PC`;
const M3 = (n) => `Saldo disponível insuficiente: ${n}`;
const M4 = (n) => `Saldo disponível insuficiente para bloquear: ${n} PC`;
const M6 = (total, partes, minimo) => `Ajuste para ${total} PC deixaria o disponível negativo (${partes}, mínimo aceitável: `
  + `${minimo} PC). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.`;
const M7 = (cod, n, q, sufixo) => `Saldo disponivel insuficiente para sucatear ${cod}: disponivel ${n} PC, solicitado ${q}. `
  + 'O disponivel ja desconta reservado, bloqueado, em inspecao e em poder de terceiros e o separado na caixa de requisições — '
  + `sucatear alem dele apagaria material que esta comprometido com outra OS.${sufixo}`;

// A48 — o texto do plano ("Letra A"), sem mudanca: e o que vai para producao.
const STATUS_A48 = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA',
  'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA', 'PRONTA_PARA_RETIRADA', 'AGUARDANDO_APROVACAO_VALOR'];
const A48 = `SELECT ma.id AS material_id, ma.codigo,
       ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) AS disponivel,
       ROUND(SUM(c.caixa), 6) AS caixa_sem_reserva,
       GROUP_CONCAT(c.numero || ' (' || c.status || ', ' || ROUND(c.caixa, 6) || ')', '; ') AS requisicoes
FROM materiais_almoxarifado ma
JOIN (
  SELECT ix.material_id, rq.numero, rq.status,
         MAX(COALESCE(ix.quantidade_separada,0) - COALESCE(ix.quantidade_entregue, ix.quantidade_atendida, 0)
             - COALESCE((SELECT SUM(rx.quantidade - COALESCE(rx.quantidade_utilizada,0))
                         FROM reservas_material_almoxarifado rx
                         WHERE rx.item_requisicao_id = ix.id AND rx.material_id = ix.material_id
                           AND rx.status = 'ATIVA' AND rx.origem = 'REQUISICAO'), 0), 0) AS caixa
  FROM itens_requisicao_almoxarifado ix
  JOIN requisicoes_almoxarifado rq ON rq.id = ix.requisicao_id
  WHERE COALESCE(rq.ativo, 1) = 1
    AND rq.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA',
                      'EM_SEPARACAO','PARCIALMENTE_ATENDIDA','PRONTA_PARA_RETIRADA','AGUARDANDO_APROVACAO_VALOR')
) c ON c.material_id = ma.id AND c.caixa > 0.000001
GROUP BY ma.id
HAVING SUM(c.caixa) > ROUND(ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
             - COALESCE(ma.quantidade_em_inspecao,0) - COALESCE(ma.quantidade_em_terceiros,0), 6) + 0.000001
ORDER BY ma.codigo;`;

(async () => {
  console.log('\n=== Etapa 97 (T3): integracao — as portas avulsas respeitam a caixa, pela rota e pelo servico ===\n');
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
    del: (u, b = {}) => request(app).delete(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const rota = (x) => ({ status: x.status, error: x.body && x.body.error });
  const recusou = (x, literal, rotulo = '') => {
    assert.strictEqual(x.status, 400, `${rotulo} esperava 400, veio ${x.status} ${x.error || ''}`);
    assert.strictEqual(x.error, literal, rotulo);
  };

  const material = async (fisico = 0) => {
    const c = `E97I-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, categoria) VALUES (?, ?, 'PC', ?, 0, 1, 0.1, ?)`, [c, c, fisico, `CAT-${c}`])).lastID;
  };
  const codigoDe = async (m) => (await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id=?', [m])).codigo;
  const req = async (itens) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-97I',
      itens: itens.map(([m, q]) => ({ material_id: m, quantidade: q })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const { numero } = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    return { R: cr.body.id, ids, numero };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const mov = (u, b) => como(u).post(`${API}/movimentacoes/v2`, { motivo: 'e97 T3', justificativa: 'teste da etapa 97 T3', os_referencia: 'OS-97I', ...b });
  const entrar = async (m, q) => {
    const r = await mov('ADMIN', { material_id: m, tipo: 'ENTRADA', quantidade: q });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const separar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/separar`, {
    itens_separados: pares.map(([item_id, q]) => ({ item_id, quantidade_separada: q })),
  });
  const entregar = (R, pares, u = 'ALMOX') => como(u).put(`${API}/requisicoes/${R}/entregar`, {
    itens_atendidos: pares.map(([item_id, q]) => ({ item_id, quantidade_atendida: q })),
  });
  // a requisicao e o saldo PELA ROTA
  const statusReq = async (R) => {
    const r = await como('ADMIN').get(`${API}/requisicoes/${R}`);
    assert.strictEqual(r.status, 200, `GET requisicao: ${JSON.stringify(r.body)}`);
    return r.body.status;
  };
  const saldo = async (m) => {
    const r = await como('ADMIN').get(`${API}/materiais/${m}`);
    assert.strictEqual(r.status, 200, `GET material: ${JSON.stringify(r.body)}`);
    const b = r.body;
    return { fisico: b.quantidade_atual, reservado: b.quantidade_reservada || 0, bloqueado: b.quantidade_bloqueada || 0, terceiros: b.quantidade_em_terceiros || 0 };
  };
  const livro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n;
  const foto = async (m) => JSON.stringify({ ...(await saldo(m)), livro: await livro(m) });
  const a48 = async (m) => (await dbAll(db, A48)).filter((x) => m === undefined || x.material_id === m);
  // Montagem: S pede `pede`, ADMIN aprova SEM estoque (sem reserva), ENTRADA `fisico`, ALMOX separa `pede`.
  const montagem = async ({ fisico = 4, pede = 4, m: mExistente } = {}) => {
    const m = mExistente || await material(0);
    const a = await req([[m, pede]]); await aprovar(a.R);
    await entrar(m, fisico);
    const s = await separar(a.R, [[a.ids[0], pede]]);
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO');
    return { m, ...a };
  };

  await test('[97 T3] a A48 do plano usa exatamente a lista STATUS_COM_CAIXA ("mudou la, muda aqui")', async () => {
    assert.deepStrictEqual([...STATUS_A48].sort(), [...STATUS_COM_CAIXA].sort());
    for (const s of STATUS_A48) assert.ok(A48.includes(`'${s}'`), `a A48 nao lista ${s}`);
  });

  // ═══════════════ Cenario 1 — a jornada pela rota: separar -> cada porta recusa -> entregar -> a porta volta ═══════════════
  await test('[97 T3 C1] pela rota: separa 4 sem reserva; SAIDA v2, SAIDA v1, PERDA, bloquear, POST /reservas, remessa, sucateamento e a conferencia que conta 0 recusam com a literal inteira, nada muda e a A48 fica vazia; A entrega 4 (ENTREGUE); a conferencia conclui; a ENTRADA nova sai', async () => {
    const a = await montagem();
    const cod = await codigoDe(a.m);
    const SA = S(4, `a requisição ${a.numero}`);
    assert.deepStrictEqual(await saldo(a.m), { fisico: 4, reservado: 0, bloqueado: 0, terceiros: 0 }, 'a separacao nao move estoque');
    assert.deepStrictEqual(await a48(a.m), [], 'A48 depois da separacao');
    const antes = await foto(a.m);
    const confere = async (rotulo) => {
      assert.strictEqual(await foto(a.m), antes, `${rotulo}: a recusa mexeu no material`);
      assert.deepStrictEqual(await a48(a.m), [], `${rotulo}: A48 achou a requisicao presa`);
      assert.strictEqual(await statusReq(a.R), 'EM_SEPARACAO');
    };
    recusou(rota(await mov('ADMIN', { material_id: a.m, tipo: 'SAIDA', quantidade: 4 })), M1(0) + SA, 'SAIDA v2');
    await confere('SAIDA v2');
    recusou(rota(await como('ADMIN').post(`${API}/movimentacoes`, { material_id: a.m, tipo: 'SAIDA', quantidade: 4, motivo: 'e97 T3', justificativa: 'teste da etapa 97 T3', os_referencia: 'OS-97I' })),
      M1(0) + SA, 'SAIDA v1');
    await confere('SAIDA v1');
    recusou(rota(await mov('ADMIN', { material_id: a.m, tipo: 'PERDA', quantidade: 4 })), M1(0) + SA, 'PERDA');
    await confere('PERDA');
    recusou(rota(await como('ADMIN').post(`${API}/materiais/${a.m}/bloquear`, { quantidade: 4, justificativa: 'teste da etapa 97 T3' })), M4(0) + SA, 'bloquear');
    await confere('bloquear');
    recusou(rota(await como('ADMIN').post(`${API}/reservas`, { material_id: a.m, quantidade: 4, os_referencia: 'OS-97I', observacoes: 'e97 T3' })), M3(0) + SA, 'POST /reservas');
    await confere('POST /reservas');
    const rem = await como('ADMIN').post(`${API}/remessas-terceiros`, { fornecedor_nome: 'Terceiro 97 T3', tipo_servico: 'Galvanizacao', itens: [{ material_id: a.m, quantidade: 4 }] });
    assert.strictEqual(rem.status, 201, `criar remessa: ${JSON.stringify(rem.body)}`);
    const { numero: numRem } = await dbGet(db, 'SELECT numero FROM remessas_terceiro_almoxarifado WHERE id=?', [rem.body.id]);
    recusou(rota(await como('ADMIN').post(`${API}/remessas-terceiros/${rem.body.id}/enviar`)),
      `Nao foi possivel enviar a remessa ${numRem}: ${cod}: disponivel 0 PC, a remessa pede 4${SA}`, 'enviar remessa');
    await confere('remessa');
    recusou(rota(await como('ADMIN').post(`${API}/sucateamentos`, { material_id: a.m, quantidade: 4, justificativa: 'sucata e97 T3' })),
      M7(cod, 0, 4, SA), 'solicitar sucateamento');
    await confere('sucateamento');
    const conf = await como('ADMIN').post(`${API}/conferencias`, { categoria: `CAT-${cod}`, tolerancia_percentual: 100 });
    assert.ok(conf.body.id, `abrir conferencia: ${JSON.stringify(conf.body)}`);
    const ic = await dbGet(db, 'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id=? AND material_id=?', [conf.body.id, a.m]);
    assert.strictEqual((await como('ADMIN').put(`${API}/conferencias/${conf.body.id}/item/${ic.id}`, { quantidade_contada: 0 })).status, 200, 'contar 0');
    // (Fase 2, menor 1) a literal INTEIRA, com o prefixo da pre-validacao — sem ele o controle (s3) passaria com a recusa do motor
    recusou(rota(await como('ADMIN').put(`${API}/conferencias/${conf.body.id}/concluir`, { aplicar_ajustes: true, justificativa_ajuste: 'contagem da etapa 97 T3' })),
      `Ajuste bloqueado: ${cod}: ${M6(0, 'separada na caixa de requisição: 4', 4)}`, 'concluir a conferencia');
    await confere('conferencia');
    // o ultimo gesto do documento: A entrega os 4
    const e = await entregar(a.R, [[a.ids[0], 4]]);
    assert.strictEqual(e.status, 200, `A entrega 4: ${JSON.stringify(e.body)}`);
    assert.strictEqual(await statusReq(a.R), 'ENTREGUE');
    assert.deepStrictEqual(await saldo(a.m), { fisico: 0, reservado: 0, bloqueado: 0, terceiros: 0 });
    // a conferencia aberta continua a jornada: conta 0 de 0 agora — conclui (sem caixa, sem retencao)
    const fim = await como('ADMIN').put(`${API}/conferencias/${conf.body.id}/concluir`, { aplicar_ajustes: true, justificativa_ajuste: 'contagem da etapa 97 T3' });
    assert.strictEqual(fim.status, 200, `concluir depois da entrega: ${JSON.stringify(fim.body)}`);
    assert.strictEqual((await saldo(a.m)).fisico, 0);
    // a caixa sumiu: a porta volta a passar
    await entrar(a.m, 1);
    const sai = await mov('ADMIN', { material_id: a.m, tipo: 'SAIDA', quantidade: 1 });
    assert.strictEqual(sai.status, 201, `SAIDA 1 depois da entrega: ${JSON.stringify(sai.body)}`);
    assert.deepStrictEqual(await saldo(a.m), { fisico: 0, reservado: 0, bloqueado: 0, terceiros: 0 });
    assert.deepStrictEqual(await a48(a.m), []);
  });

  // ═══════════════ Cenario 2 — a corrida porta avulsa x separacao (gancho de 1 disparo) e a entrega dentro da secao ═══════════════
  // O gancho da s4b: segura a escrita de `quantidade_separada` (a separacao ja leu o teto) e avisa; a porta avulsa e
  // disparada FORA da secao da separacao (o `await parada` volta no contexto do teste). Errado = separado > fisico.
  const corrida = async (dispararSaida, rodadas = 10) => {
    let errados = 0; const disparosPorRodada = []; let primeira = null;
    const origRun = db.run;
    try {
      for (let i = 0; i < rodadas; i++) {
        const m = await material(0); // eslint-disable-line no-await-in-loop
        const a = await req([[m, 4]]); await aprovar(a.R); // eslint-disable-line no-await-in-loop
        await entrar(m, 4); // eslint-disable-line no-await-in-loop
        let parou; const parada = new Promise((r) => { parou = r; });
        let liberar; const liberado = new Promise((r) => { liberar = r; });
        let disparos = 0;
        db.run = function ganchoE97T3(sql, ...resto) {
          if (/UPDATE itens_requisicao_almoxarifado SET quantidade_separada/.test(sql)) {
            disparos++;
            if (disparos === 1) { parou(); liberado.then(() => origRun.call(db, sql, ...resto)); return db; }
          }
          return origRun.call(db, sql, ...resto);
        };
        const sep = dispararSaida.separar(a);
        await parada; // eslint-disable-line no-await-in-loop
        const saida = dispararSaida.saida(m);
        await dormir(30); // eslint-disable-line no-await-in-loop
        liberar();
        const [s, x] = await Promise.all([sep, saida]); // eslint-disable-line no-await-in-loop
        db.run = origRun;
        disparosPorRodada.push(disparos);
        const est = await dbGet(db, `SELECT ma.quantidade_atual q, ix.quantidade_separada sep FROM materiais_almoxarifado ma
          JOIN itens_requisicao_almoxarifado ix ON ix.material_id = ma.id WHERE ma.id = ?`, [m]); // eslint-disable-line no-await-in-loop
        if (est.sep > est.q + 1e-9) errados++;
        assert.strictEqual(s, 200, `a separacao conclui (rodada ${i})`);
        if (i === 0) primeira = { x, a };
      }
    } finally { db.run = origRun; }
    assert.deepStrictEqual(disparosPorRodada, Array(rodadas).fill(1), 'o gancho disparou uma vez por rodada');
    // primeiro o placar (o controle diz N/10), depois a literal e o fim do documento da primeira rodada
    assert.strictEqual(errados, 0, `${errados}/${rodadas} rodadas com separado > fisico`);
    recusou(primeira.x, M1(0) + S(4, `a requisição ${primeira.a.numero}`), 'a SAIDA depois da separacao');
    const e = await entregar(primeira.a.R, [[primeira.a.ids[0], 4]]);
    assert.strictEqual(e.status, 200, `A entrega 4: ${JSON.stringify(e.body)}`);
    assert.strictEqual(await statusReq(primeira.a.R), 'ENTREGUE');
  };

  await test('[97 T3 C2] RN-05 pelo SERVICO (separarRequisicao x registrarMovimentacao, sem app): a SAIDA avulsa espera a separacao e recusa — 0/10 com separado > fisico', async () => {
    await corrida({
      separar: (a) => requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], { ...USERS.ALMOX })
        .then(() => 200, (e) => e.status || 500),
      saida: (m) => stockService.registrarMovimentacao(db, { ...USERS.ADMIN }, { material_id: m, tipo: 'SAIDA', quantidade: 4, motivo: 'e97 T3', justificativa: 'x' })
        .then(() => ({ status: 201 }), (e) => ({ status: e.status || 500, error: e.message })),
    });
  });

  await test('[97 T3 C2] RN-05 pela ROTA (PUT /separar x POST /movimentacoes/v2): a SAIDA avulsa espera a separacao e recusa — 0/10 com separado > fisico', async () => {
    await corrida({
      separar: (a) => separar(a.R, [[a.ids[0], 4]]).then((r) => r.status),
      saida: (m) => mov('ADMIN', { material_id: m, tipo: 'SAIDA', quantidade: 4 }).then(rota),
    });
  });

  await test('[97 T3 C2] a entrega chama o motor DENTRO da propria secao e nao espera a si mesma — pelo servico e pela rota', async () => {
    const a = await montagem();
    const p = requisitionService.entregarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_atendida: 4 }], { ...USERS.ALMOX });
    assert.strictEqual(await comPrazo(p, 3000), 'resolveu', 'a entrega pelo servico esperou a si mesma');
    assert.strictEqual(await statusReq(a.R), 'ENTREGUE');
    const b = await montagem();
    assert.strictEqual(await comPrazo(entregar(b.R, [[b.ids[0], 4]]), 3000), 'resolveu', 'a entrega pela rota esperou a si mesma');
    assert.strictEqual(await statusReq(b.R), 'ENTREGUE');
    assert.deepStrictEqual([(await saldo(a.m)).fisico, (await saldo(b.m)).fisico], [0, 0]);
  });

  // ═══════════════ Cenario 3 — RN-06: o caso legitimo (material perdido/quebrado na caixa) ═══════════════
  // Fase 5 (A): as quatro portas avulsas que NAO sao SAIDA tem a propria trava (fora do `registrarMovimentacao`): a
  // reserva manual (`criarReserva`), e as escritas curtas dos estornos de ENTRADA, de AJUSTE e de DESBLOQUEIO. Sabotadas
  // juntas, a suite inteira ficava verde (e97rv2: run-all 338/338). Uma corrida por porta, com o gancho de 1 disparo
  // (a separacao parada antes de gravar `quantidade_separada`, depois de ler o teto); errado = retido + caixa > fisico.
  const ADMS = { ...USERS.ADMIN };
  const svcMov = (p, o) => stockService.registrarMovimentacao(db, ADMS, { motivo: 'e97 f5', justificativa: 'e97 f5', ...p }, o);
  const PORTAS_NAO_SAIDA = {
    reservaManual: {
      prep: async (m) => { await svcMov({ material_id: m, tipo: 'ENTRADA', quantidade: 4 }); },
      ato: (m) => stockService.criarReserva(db, ADMS, { material_id: m, quantidade: 4, os_referencia: 'OS-97I', observacoes: 'e97 f5' }),
    },
    estornoEntrada: {
      prep: async (m, ctx) => { ctx.mov = (await svcMov({ material_id: m, tipo: 'ENTRADA', quantidade: 4 })).id; },
      ato: (m, ctx) => stockService.cancelarMovimentacao(db, ADMS, ctx.mov, 'e97 f5'),
    },
    estornoAjuste: {
      prep: async (m, ctx) => { ctx.mov = (await svcMov({ material_id: m, tipo: 'AJUSTE', quantidade: 4 })).id; },
      ato: (m, ctx) => stockService.cancelarMovimentacao(db, ADMS, ctx.mov, 'e97 f5'),
    },
    estornoDesbloqueio: {
      prep: async (m, ctx) => {
        await svcMov({ material_id: m, tipo: 'ENTRADA', quantidade: 4 });
        await svcMov({ material_id: m, tipo: 'BLOQUEIO', quantidade: 4 }, { bloqueioAvulso: true });
        ctx.mov = (await svcMov({ material_id: m, tipo: 'DESBLOQUEIO', quantidade: 4 })).id;
      },
      ato: (m, ctx) => stockService.cancelarMovimentacao(db, ADMS, ctx.mov, 'e97 f5'),
    },
  };
  const corridaPorta = async (porta, rodadas = 10) => {
    let errados = 0; const disparosPorRodada = []; const atos = new Set();
    const origRun = db.run;
    try {
      for (let i = 0; i < rodadas; i++) {
        const m = await material(0); // eslint-disable-line no-await-in-loop
        const a = await req([[m, 4]]); await aprovar(a.R); // eslint-disable-line no-await-in-loop
        const ctx = {}; await porta.prep(m, ctx); // eslint-disable-line no-await-in-loop
        let parou; const parada = new Promise((r) => { parou = r; });
        let liberar; const liberado = new Promise((r) => { liberar = r; });
        let disparos = 0;
        db.run = function ganchoE97F5A(sql, ...resto) {
          if (/UPDATE itens_requisicao_almoxarifado SET quantidade_separada/.test(sql)) {
            disparos++;
            if (disparos === 1) { parou(); liberado.then(() => origRun.call(db, sql, ...resto)); return db; }
          }
          return origRun.call(db, sql, ...resto);
        };
        const sep = requisitionService.separarRequisicao(db, a.R, [{ item_id: a.ids[0], quantidade_separada: 4 }], { ...USERS.ALMOX })
          .then(() => 200, (e) => e.status || 500);
        await parada; // eslint-disable-line no-await-in-loop
        const ato = porta.ato(m, ctx).then(() => 'ok', (e) => e.status || 500);
        await dormir(30); // eslint-disable-line no-await-in-loop
        liberar();
        const [s, x] = await Promise.all([sep, ato]); // eslint-disable-line no-await-in-loop
        db.run = origRun;
        disparosPorRodada.push(disparos); atos.add(x);
        assert.strictEqual(s, 200, `a separacao conclui (rodada ${i})`);
        const mt = await dbGet(db, `SELECT quantidade_atual q, COALESCE(quantidade_reservada,0) r, COALESCE(quantidade_bloqueada,0) b
          FROM materiais_almoxarifado WHERE id=?`, [m]); // eslint-disable-line no-await-in-loop
        const sepq = (await dbGet(db, 'SELECT quantidade_separada s FROM itens_requisicao_almoxarifado WHERE id=?', [a.ids[0]])).s; // eslint-disable-line no-await-in-loop
        if (mt.r + mt.b + sepq > mt.q + 1e-9) errados++;
      }
    } finally { db.run = origRun; }
    assert.deepStrictEqual(disparosPorRodada, Array(rodadas).fill(1), 'o gancho disparou uma vez por rodada');
    assert.strictEqual(errados, 0, `${errados}/${rodadas} rodadas com retido + caixa > fisico (a porta respondeu: ${[...atos].join(', ')})`);
    assert.deepStrictEqual([...atos], [400], 'a porta espera a separacao e recusa');
  };
  for (const [nome, porta] of Object.entries(PORTAS_NAO_SAIDA)) {
    await test(`[97 F5-A] corrida separacao x ${nome} (porta avulsa nao-SAIDA, trava propria): a porta espera a separacao e recusa — 0/10 com retido + caixa > fisico`, async () => {
      await corridaPorta(porta);
    });
  }

  await test('[97 T3 C3] RN-06 entregar o que sobrou e encerrar: a PERDA recusa com o S antes de soltar a caixa; entrega 2 -> PARCIALMENTE_ATENDIDA; a PERDA ainda recusa; encerrar -> ENCERRADA; PERDA 2 -> 201, fisico 0', async () => {
    const a = await montagem();
    recusou(rota(await mov('ALMOX', { material_id: a.m, tipo: 'PERDA', quantidade: 2 })), M1(0) + S(4, `a requisição ${a.numero}`), 'PERDA 2 com a caixa 4');
    const e = await entregar(a.R, [[a.ids[0], 2]]);
    assert.strictEqual(e.status, 200, `entregar 2: ${JSON.stringify(e.body)}`);
    assert.strictEqual(await statusReq(a.R), 'PARCIALMENTE_ATENDIDA');
    assert.strictEqual((await saldo(a.m)).fisico, 2);
    recusou(rota(await mov('ALMOX', { material_id: a.m, tipo: 'PERDA', quantidade: 2 })), M1(0) + S(2, `a requisição ${a.numero}`), 'PERDA 2 com a caixa 2');
    const enc = await como('ADMIN').put(`${API}/requisicoes/${a.R}/encerrar`, { motivo: 'material quebrado na caixa (e97 T3)' });
    assert.strictEqual(enc.status, 200, `encerrar: ${JSON.stringify(enc.body)}`);
    assert.strictEqual(await statusReq(a.R), 'ENCERRADA');
    const perda = await mov('ALMOX', { material_id: a.m, tipo: 'PERDA', quantidade: 2 });
    assert.strictEqual(perda.status, 201, `PERDA 2 depois de encerrar: ${JSON.stringify(perda.body)}`);
    assert.deepStrictEqual(await saldo(a.m), { fisico: 0, reservado: 0, bloqueado: 0, terceiros: 0 });
    assert.deepStrictEqual(await a48(a.m), []);
  });

  await test('[97 T3 C3] RN-06 tudo perdido: o ALMOXARIFE nao exclui (403); o ADMIN exclui (200, inativa); PERDA 4 -> 201, fisico 0', async () => {
    const a = await montagem();
    const negado = await como('ALMOX').del(`${API}/requisicoes/${a.R}`, { justificativa: 'material perdido (e97 T3)' });
    assert.strictEqual(negado.status, 403, JSON.stringify(negado.body));
    assert.strictEqual(negado.body.error, 'Apenas administradores do Almoxarifado ou Super Administrador podem excluir requisições');
    recusou(rota(await mov('ADMIN', { material_id: a.m, tipo: 'PERDA', quantidade: 4 })), M1(0) + S(4, `a requisição ${a.numero}`), 'PERDA 4 antes de excluir');
    const ex = await como('ADMIN').del(`${API}/requisicoes/${a.R}`, { justificativa: 'material perdido (e97 T3)' });
    assert.strictEqual(ex.status, 200, `excluir: ${JSON.stringify(ex.body)}`);
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM requisicoes_almoxarifado WHERE id=?', [a.R])).ativo, 0);
    const perda = await mov('ADMIN', { material_id: a.m, tipo: 'PERDA', quantidade: 4 });
    assert.strictEqual(perda.status, 201, `PERDA 4 depois de excluir: ${JSON.stringify(perda.body)}`);
    assert.deepStrictEqual(await saldo(a.m), { fisico: 0, reservado: 0, bloqueado: 0, terceiros: 0 });
  });

  // ═══════════════ Cenario 4 — a s5 inteira pela rota (RN-03) e a A48 como controle positivo ═══════════════
  await test('[97 T3 C4] s5 pela rota: A e B separam 4 com fisico 8; a SAIDA avulsa 4 nao monta mais o legado (400); legado por escritor direto -> a A48 acha A e B; A entrega a propria caixa (200); a A48 acha so B, que fica presa ("Maximo: 0"); o ADMIN exclui B e a A48 esvazia', async () => {
    const m = await material(0);
    const cod = await codigoDe(m);
    const A = await req([[m, 4]]); await aprovar(A.R);
    const B = await req([[m, 4]]); await aprovar(B.R);
    await entrar(m, 8);
    assert.strictEqual((await separar(A.R, [[A.ids[0], 4]])).status, 200);
    assert.strictEqual((await separar(B.R, [[B.ids[0], 4]], 'ALMOX2')).status, 200);
    recusou(rota(await mov('ADMIN', { material_id: m, tipo: 'SAIDA', quantidade: 4 })), M1(0) + S(8, `as requisições ${A.numero} e ${B.numero}`), 'SAIDA 4');
    assert.deepStrictEqual(await a48(m), [], 'a porta nao montou o legado');
    // o legado que o defeito produzia antes da 97 (caixas 8 sobre fisico 4): escritor direto, declarado
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m]);
    const l1 = await a48(m);
    assert.strictEqual(l1.length, 1, 'controle positivo: a A48 acha o legado');
    assert.deepStrictEqual([l1[0].codigo, l1[0].disponivel, l1[0].caixa_sem_reserva], [cod, 4, 8]);
    assert.deepStrictEqual(l1[0].requisicoes.split('; ').sort(), [`${A.numero} (EM_SEPARACAO, 4.0)`, `${B.numero} (EM_SEPARACAO, 4.0)`].sort());
    // a entrega fica na regua de hoje (B492): A entrega a propria caixa
    const eA = await entregar(A.R, [[A.ids[0], 4]]);
    assert.strictEqual(eA.status, 200, `A entrega 4: ${JSON.stringify(eA.body)}`);
    assert.strictEqual(await statusReq(A.R), 'ENTREGUE');
    assert.strictEqual((await saldo(m)).fisico, 0);
    const l2 = await a48(m);
    assert.deepStrictEqual(l2.map((x) => [x.disponivel, x.caixa_sem_reserva, x.requisicoes]), [[0, 4, `${B.numero} (EM_SEPARACAO, 4.0)`]]);
    const eB = await entregar(B.R, [[B.ids[0], 4]], 'ALMOX2');
    assert.strictEqual(eB.status, 400, `B: ${JSON.stringify(eB.body)}`);
    assert.strictEqual(eB.body.error, `${cod}: não é possível entregar 4 PC. Máximo: 0 (pendente: 4, disponível: 0)`, 'B presa');
    // a saida de B (C188): o administrador exclui
    const ex = await como('ADMIN').del(`${API}/requisicoes/${B.R}`, { justificativa: 'legado preso (e97 T3)' });
    assert.strictEqual(ex.status, 200, `excluir B: ${JSON.stringify(ex.body)}`);
    assert.deepStrictEqual(await a48(m), []);
    assert.deepStrictEqual(await saldo(m), { fisico: 0, reservado: 0, bloqueado: 0, terceiros: 0 });
  });

  await test('[97 T3] fim: a A48 do banco inteiro esta vazia — nenhuma jornada deixou requisicao presa', async () => {
    assert.deepStrictEqual(await a48(), []);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
