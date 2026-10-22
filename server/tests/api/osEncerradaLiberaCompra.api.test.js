/**
 * Etapa 171 (T3) — a OS encerrada solta o material que a compra dela prendeu; a OS com pedido de compra nao se apaga.
 *
 *   RN-171.09 (C2)  OS que entra em cancelado/cancelada/concluido/concluida/encerrada: as reservas da OS do predicado congelado
 *                   (ATIVA, MANUAL, os_id, recebimento_id preenchido) viram LIBERADA, motivo `OS <numero> <status> — material volta
 *                   ao estoque`; a reserva liberada e a movimentacao continuam com o os_id. So a TRANSICAO solta.
 *   RN-171.09 (I7)  o que soltou vai para a requisicao que esperava, marcada com a nota de origem.
 *   RN-171.10       `pedidosDaOs` e a frase literal da recusa da exclusao.
 *
 * No harness (M1 da revisao da Fase 2): `ordens_servico` e criada aqui; a reserva da OS e semeada com `stockService.criarReserva`
 * (os_id no corpo, recebimento_id no 4o argumento) — independente da T2. A fiacao no index.js: osEncerradaRotas.api.test.js.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa171-pedido-de-compra-vinculado-a-os.md
 * Executar: cd server && node tests/api/osEncerradaLiberaCompra.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const reservaChegadaService = require('../../services/almoxarifado/reservaChegadaService');
const osEncerradaService = require('../../services/almoxarifado/osEncerradaService');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
// Uma espera pela trava que nunca solta (ela nao e reentrante) esvazia o event loop e o node sai com 0 sem placar — conta como falha.
let terminou = false;
process.on('exit', () => {
  if (!terminou) { console.error('  ✗ o teste saiu sem terminar (promessa pendurada — trava esperando a si mesma?)'); process.exitCode = 1; }
});
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Operacional 171', role: 'admin', is_superadmin: 1, email: 'op171@t.com' };
const SOL = { id: 17101, nome: 'Solicitante 171', role: 'admin', is_superadmin: 1, email: 's171@t.com' };
const API = '/api/almoxarifado';
const FECHADOS = ['cancelado', 'cancelada', 'concluido', 'concluida', 'encerrada'];
let seq = 0;

(async () => {
  console.log('\n=== Etapa 171 (T3): OS encerrada libera a compra; OS com pedido nao se apaga ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };
  const calarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { r: await fn(), msgs }; } finally { console.warn = orig; }
  };

  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'pendente')`);
  const novaOs = async (status = 'em_andamento') => {
    const numero = `OS-171-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, status) VALUES (?, ?)', [numero, status])).lastID, numero };
  };
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F171','17100000000171','ativo')")).lastID;
  const material = async () => {
    const c = `E171-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 0, 1, ?, 0)`, [c, `Mat ${c}`, forn])).lastID;
  };
  const entrada = async (m, q) => {
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'setup 171' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
  };
  const recebimento = async () => (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status)
    VALUES (?, 'CONCLUIDO')`, [`REC-171-${++seq}`])).lastID;
  // A reserva da OS como a T2 a cria (o predicado congelado): MANUAL, os_id, recebimento_id.
  const reservaDaOs = async (m, q, osId, recId) => (await stockService.criarReserva(db, ADMIN,
    { material_id: m, quantidade: q, os_id: osId }, { sistema: true, recebimento_id: recId, motivo: 'Compra para a OS (semeada)' })).id;
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const disponivel = async (m) => {
    const x = await dbGet(db, 'SELECT quantidade_atual q, quantidade_reservada r FROM materiais_almoxarifado WHERE id = ?', [m]);
    return Number(x.q) - Number(x.r);
  };
  const criarReqEsperando = async (m, q) => {
    const r = await as(SOL, () => request(app).post(`${API}/requisicoes`)
      .send({ os_referencia: 'OS-INT', itens: [{ material_id: m, quantidade: q }] }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const a = await request(app).put(`${API}/requisicoes/${r.body.id}/aprovar`).send({});
    assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    assert.ok(['AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA'].includes(a.body.status), `premissa: espera (${a.body.status})`);
    return r.body.id;
  };

  for (const status of FECHADOS) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-171.09, C2] OS ${status}: a reserva da OS vira LIBERADA com o motivo, o os_id fica na reserva e na movimentacao, o disponivel sobe`, async () => {
      const m = await material(); await entrada(m, 10);
      const os = await novaOs('em_andamento'); const rec = await recebimento();
      const rid = await reservaDaOs(m, 10, os.id, rec);
      assert.strictEqual(await disponivel(m), 0, 'premissa: a OS prende tudo');
      const n = await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, status);
      assert.strictEqual(n, 1);
      const r = await reserva(rid);
      const motivo = `OS ${os.numero} ${status} — material volta ao estoque`;
      assert.deepStrictEqual({ status: r.status, os_id: r.os_id, recebimento_id: r.recebimento_id, motivo: r.motivo_liberacao, por: r.liberado_por },
        { status: 'LIBERADA', os_id: os.id, recebimento_id: rec, motivo, por: ADMIN.id });
      const mov = await dbGet(db, "SELECT * FROM movimentacoes_almoxarifado WHERE reserva_id = ? AND tipo = 'LIBERACAO_RESERVA'", [rid]);
      assert.ok(mov, 'a movimentacao da liberacao existe');
      assert.deepStrictEqual({ os_id: mov.os_id, motivo: mov.motivo, q: Number(mov.quantidade) }, { os_id: os.id, motivo, q: 10 });
      assert.strictEqual(await disponivel(m), 10);
    });
  }

  await test('[RN-171.09] status com caixa e espaco (" Cancelada ") solta, e o motivo leva o status aparado', async () => {
    const m = await material(); await entrada(m, 4);
    const os = await novaOs(); const rid = await reservaDaOs(m, 4, os.id, await recebimento());
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, ' Cancelada '), 1);
    assert.strictEqual((await reserva(rid)).motivo_liberacao, `OS ${os.numero} Cancelada — material volta ao estoque`);
  });

  await test('[RN-171.09] status aberto (em_andamento, pendente) nao solta nada', async () => {
    const m = await material(); await entrada(m, 5);
    const os = await novaOs('pendente'); const rid = await reservaDaOs(m, 5, os.id, await recebimento());
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'em_andamento'), 0);
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'pendente'), 0);
    assert.strictEqual((await reserva(rid)).status, 'ATIVA');
    assert.strictEqual(await disponivel(m), 0);
  });

  await test('[RN-171.09] so a TRANSICAO solta: pendente->cancelado sim; cancelada->cancelado, concluida->encerrada e pendente->em_andamento nao', async () => {
    const t = osEncerradaService.entrouNoFechado;
    assert.deepStrictEqual(
      [t('pendente', 'cancelado'), t('em_andamento', 'concluida'), t(null, 'encerrada'), t('cancelada', 'cancelado'),
        t('concluida', 'encerrada'), t(' CANCELADO ', 'cancelada'), t('pendente', 'em_andamento'), t('cancelado', 'pendente')],
      [true, true, true, false, false, false, false, false]);
  });

  await test('[RN-171.09] chamar de novo nao libera de novo (nenhuma ATIVA sobrou) e nao falha', async () => {
    const m = await material(); await entrada(m, 3);
    const os = await novaOs(); await reservaDaOs(m, 3, os.id, await recebimento());
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelado'), 1);
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelado'), 0);
    assert.strictEqual(await disponivel(m), 3);
  });

  await test('[RN-171.09, predicado congelado] reserva de requisicao da OS, MANUAL da OS sem recebimento_id e a da OUTRA OS ficam ATIVAS', async () => {
    const m = await material(); await entrada(m, 20);
    const os = await novaOs(); const outra = await novaOs(); const rec = await recebimento();
    const daOs = await reservaDaOs(m, 4, os.id, rec);
    const semRec = (await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 3, os_id: os.id }, { sistema: true })).id;
    const daOutra = await reservaDaOs(m, 2, outra.id, rec);
    const reqId = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, ativo)
      VALUES (?, ?, 'Sol', 'APROVADO', 1)`, [`REQ-171-${++seq}`, SOL.id])).lastID;
    const itemId = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
      VALUES (?, ?, 5)`, [reqId, m])).lastID;
    const daReq = (await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 5, os_id: os.id },
      { sistema: true, requisicao_id: reqId, item_requisicao_id: itemId, recebimento_id: rec })).id;
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelada'), 1);
    assert.strictEqual((await reserva(daOs)).status, 'LIBERADA');
    for (const [rotulo, id] of [['sem recebimento', semRec], ['outra OS', daOutra], ['da requisicao', daReq]]) {
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await reserva(id)).status, 'ATIVA', rotulo);
    }
  });

  await test('[RN-171.09, I7] o que soltou vai para a requisicao que esperava, marcado com a nota de origem; o resto fica livre', async () => {
    const m = await material(); await entrada(m, 10);
    const os = await novaOs(); const rec = await recebimento();
    const rid = await reservaDaOs(m, 10, os.id, rec);
    const reqId = await criarReqEsperando(m, 6);
    assert.strictEqual((await dbAll(db, "SELECT id FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [reqId])).length, 0,
      'premissa: a requisicao espera sem reserva (a OS prende tudo)');
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'concluida'), 1);
    assert.strictEqual((await reserva(rid)).status, 'LIBERADA');
    const daReq = await dbAll(db, "SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [reqId]);
    assert.strictEqual(daReq.length, 1, 'a requisicao ganhou a reserva');
    assert.deepStrictEqual({ q: Number(daReq[0].quantidade), origem: daReq[0].origem, rec: daReq[0].recebimento_id }, { q: 6, origem: 'REQUISICAO', rec });
    assert.strictEqual(await disponivel(m), 4);
    const st = (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId])).status;
    assert.strictEqual(st, 'TOTALMENTE_RESERVADA', 'o status acompanha (recalculo depois de soltar a trava)');
  });

  await test('[RN-171.09, I7] a redistribuicao roda FORA de qualquer trava do chamador (a porta pega a sua) e por material + nota', async () => {
    const m1 = await material(); const m2 = await material(); await entrada(m1, 4); await entrada(m2, 6);
    const os = await novaOs(); const recA = await recebimento(); const recB = await recebimento();
    await reservaDaOs(m1, 1, os.id, recA); await reservaDaOs(m1, 3, os.id, recB); await reservaDaOs(m2, 6, os.id, recA);
    const orig = reservaChegadaService.reservarLiberacaoParaQuemEspera;
    const chamadas = [];
    reservaChegadaService.reservarLiberacaoParaQuemEspera = async (dbx, user, ctx, resultado, opcoes) => {
      chamadas.push({ material_id: ctx.material_id, recebimento_id: ctx.recebimento_id, quantidade: ctx.quantidade, origem: ctx.origem,
        documento_id: ctx.documento_id, opcoes: opcoes === undefined ? 'sem' : opcoes, travado: trava.travado(ctx.material_id) });
      return { reservas: [], status: [] };
    };
    try {
      assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'encerrada'), 3);
    } finally { reservaChegadaService.reservarLiberacaoParaQuemEspera = orig; }
    const ord = (a) => [...a].sort((x, y) => x.material_id - y.material_id || x.recebimento_id - y.recebimento_id);
    assert.deepStrictEqual(ord(chamadas), ord([
      { material_id: m1, recebimento_id: recA, quantidade: 1, origem: 'OS_ENCERRADA', documento_id: os.id, opcoes: 'sem', travado: false },
      { material_id: m1, recebimento_id: recB, quantidade: 3, origem: 'OS_ENCERRADA', documento_id: os.id, opcoes: 'sem', travado: false },
      { material_id: m2, recebimento_id: recA, quantidade: 6, origem: 'OS_ENCERRADA', documento_id: os.id, opcoes: 'sem', travado: false },
    ]));
  });

  await test('[RN-171.09] falha na redistribuicao nao derruba: a reserva ja foi liberada e a funcao devolve n', async () => {
    const m = await material(); await entrada(m, 2);
    const os = await novaOs(); const rid = await reservaDaOs(m, 2, os.id, await recebimento());
    const orig = reservaChegadaService.reservarLiberacaoParaQuemEspera;
    reservaChegadaService.reservarLiberacaoParaQuemEspera = async () => { throw new Error('banco caiu 171'); };
    let out;
    try {
      out = await calarWarn(() => osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelado'));
    } finally { reservaChegadaService.reservarLiberacaoParaQuemEspera = orig; }
    assert.strictEqual(out.r, 1);
    assert.ok(out.msgs.some((x) => x.includes('banco caiu 171')), out.msgs.join('|'));
    assert.strictEqual((await reserva(rid)).status, 'LIBERADA');
  });

  await test('[RN-171.09] falha numa liberacao: as outras seguem e o erro traz liberadas/falhas (a rota responde com aviso)', async () => {
    const m = await material(); await entrada(m, 5);
    const os = await novaOs(); const rec = await recebimento();
    const r1 = await reservaDaOs(m, 2, os.id, rec); const r2 = await reservaDaOs(m, 3, os.id, rec);
    const orig = stockService.liberarReserva;
    stockService.liberarReserva = async (dbx, u, id, q, o) => {
      if (id === r1) throw new Error('trava de linha 171');
      return orig(dbx, u, id, q, o);
    };
    let erro = null;
    try {
      await calarWarn(() => osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelado'));
    } catch (e) { erro = e; } finally { stockService.liberarReserva = orig; }
    assert.ok(erro, 'lanca no fim');
    assert.strictEqual(erro.liberadas, 1);
    assert.deepStrictEqual(erro.falhas, [{ reserva_id: r1, erro: 'trava de linha 171' }]);
    assert.ok(erro.message.includes(`OS ${os.numero}`), erro.message);
    assert.deepStrictEqual([(await reserva(r1)).status, (await reserva(r2)).status], ['ATIVA', 'LIBERADA']);
  });

  await test('[RN-171.09] reserva que outro gesto soltou no meio (dois PUTs cancelando juntos): nao e falha nem conta, e nao redistribui', async () => {
    const m = await material(); await entrada(m, 2);
    const os = await novaOs(); const rid = await reservaDaOs(m, 2, os.id, await recebimento());
    const orig = stockService.liberarReserva;
    const origDist = reservaChegadaService.reservarLiberacaoParaQuemEspera;
    let distribuiu = 0;
    stockService.liberarReserva = async (dbx, u, id, q, o) => {
      await orig(dbx, u, id, q, { ...o, motivo: 'o outro PUT' }); // o concorrente ganha o claim
      return orig(dbx, u, id, q, o); // e o nosso perde: "Reserva liberada não pode ser liberada"
    };
    reservaChegadaService.reservarLiberacaoParaQuemEspera = async () => { distribuiu++; return { reservas: [], status: [] }; };
    let out;
    try {
      out = await calarWarn(() => osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelado'));
    } finally { stockService.liberarReserva = orig; reservaChegadaService.reservarLiberacaoParaQuemEspera = origDist; }
    assert.deepStrictEqual([out.r, out.msgs, distribuiu], [0, [], 0]);
    assert.strictEqual((await reserva(rid)).motivo_liberacao, 'o outro PUT');
  });

  await test('[RN-171.09] OS sem numero (apagada) usa #id no motivo', async () => {
    const m = await material(); await entrada(m, 1);
    const os = await novaOs(); const rid = await reservaDaOs(m, 1, os.id, await recebimento());
    await dbRun(db, 'DELETE FROM ordens_servico WHERE id = ?', [os.id]);
    assert.strictEqual(await osEncerradaService.liberarReservasDaOs(db, ADMIN, os.id, 'cancelado'), 1);
    assert.strictEqual((await reserva(rid)).motivo_liberacao, `OS #${os.id} cancelado — material volta ao estoque`);
  });

  await test('[RN-171.10] pedidosDaOs lista os numeros dos pedidos da OS (e so dela), na ordem; a recusa e literal', async () => {
    const os = await novaOs(); const outra = await novaOs(); const vazia = await novaOs();
    const pc = async (numero, osId) => dbRun(db, 'INSERT INTO pedidos_compra (numero, fornecedor_id, os_id) VALUES (?, ?, ?)', [numero, forn, osId]);
    await pc(`PC-171-A-${seq}`, os.id); await pc(`PC-171-X-${seq}`, outra.id); await pc(`PC-171-B-${seq}`, os.id);
    const nums = await osEncerradaService.pedidosDaOs(db, os.id);
    assert.deepStrictEqual(nums, [`PC-171-A-${seq}`, `PC-171-B-${seq}`]);
    assert.deepStrictEqual(await osEncerradaService.pedidosDaOs(db, vazia.id), []);
    assert.strictEqual(osEncerradaService.recusaExclusaoComPedido(os.numero, nums),
      `A OS ${os.numero} tem pedido de compra vinculado (PC-171-A-${seq}, PC-171-B-${seq}) — cancele a OS em vez de excluir`);
  });

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
