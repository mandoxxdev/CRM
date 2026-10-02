/**
 * Etapa 76 (T0, C127) — o recalculo do status sob a trava por material, e a funcao das portas.
 *
 * Ate a 75, liberar a mao ou deixar vencer a reserva de uma requisicao devolvia o saldo ao disponivel
 * e deixava a requisicao dizendo "Totalmente Reservada" sem nada seguro. A 76 recalcula o status pela
 * mesma regua da 74 (`recalcularStatusDeReserva`), mas SOB A TRAVA de todos os materiais da requisicao
 * (D3/B398): a Fase 0 mediu (3/3) que o `WHERE status = <lido>` sozinho deixa um recalculo atrasado
 * gravar APROVADO com hold 4 quando uma nota do mesmo material reserva no meio.
 *
 * Este arquivo entra PELO SERVICO: a liberacao e feita direto em `stockService.liberarReserva` (sem o
 * gancho das portas, T1/T2), para isolar `recalcularRequisicoesDasReservas` e `recalcularStatusSobTrava`.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa76-liberar-expirar-recalcula-status.md (T0
 * e a "Fase 2 — revisao do plano", que vale sobre o texto da T0).
 *
 * Executar: cd server && node tests/api/reservaRecalculoBase.api.test.js
 */
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const rcs = require('../../services/almoxarifado/reservaChegadaService');
const rsm = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 76', role: 'admin', is_superadmin: 1, email: 'a76@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
// Rede contra teste vazio: se o event loop esvaziar no meio (uma promise presa sem timer vivo), o Node
// sairia com 0 sem imprimir o placar. Aqui isso vira falha.
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 76 (T0): recalculo do status sob a trava por material ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F76B','76000000000190','ativo')")).lastID;
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');

  // Uma trava que nao solta PRENDE a suite em vez de falhar: toda espera concorrente tem limite.
  // O timer NAO e `unref()` (medido no controle "sem DISTINCT"): com a trava presa e o timer solto, o
  // event loop esvazia e o Node SAI COM CODIGO 0 no meio do arquivo — o runner contaria como verde.
  const comLimite = (p, ms = 15000) => {
    let t;
    const limite = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`PRESA: passou de ${ms} ms (a trava do material nao soltou?)`)), ms);
    });
    return Promise.race([p, limite]).finally(() => clearTimeout(t));
  };
  const dormir = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const material = async (q) => {
    const c = `E76B-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, ?, 0)`, [c, `Mat ${c}`, q, forn])).lastID;
  };
  const reqPend = async (itens, status = 'PENDENTE') => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor)
      VALUES (?, 99, 'Sol 76', ?, 'NORMAL', '2026-09-01 10:00:00', 1, '2026-09-01 10:00:00')`,
    [`REQ-E76B-${++seq}`, status])).lastID;
    for (const [m, q, sep = 0, ent = 0] of itens) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,?,?,?)`, [id, m, q, sep, ent, ent]);
    }
    return id;
  };
  const aprovar = async (id) => {
    const r = await request(app).put(`${API}/requisicoes/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reservas = (rid) => dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'
    ORDER BY material_id, id`, [rid]);
  const hold = async (rid) => (await reservas(rid))
    .reduce((s, x) => s + Number(x.quantidade) - Number(x.quantidade_utilizada || 0), 0);
  const liberar = (reservaId, q = null) => stockService.liberarReserva(db, ADMIN, reservaId, q, { motivo: 'teste 76' });
  const notaSemProcessar = async (m, q) => {
    const r = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F76B', '2026-09-01', '2026-09-02', 10)`, [`REC-E76B-${++seq}`, `NF-E76B-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [r, m, q, q]);
    return r;
  };
  // supertest so dispara a requisicao no `.then`: `.then((x) => x)` a poe no ar sem esperar.
  const processar = (rec) => request(app).post(`${API}/recebimentos/${rec}/processar`).send({}).then((x) => x);
  const espiao = () => {
    const orig = rcs.recalcularStatusSobTrava;
    const chamadas = [];
    rcs.recalcularStatusSobTrava = (dbx, id) => { chamadas.push(id); return orig(dbx, id); };
    return { chamadas, restaurar: () => { rcs.recalcularStatusSobTrava = orig; } };
  };
  const capturarWarn = async (fn) => {
    const orig = console.warn; const msgs = [];
    console.warn = (...a) => { msgs.push(a.join(' ')); };
    try { return { valor: await fn(), msgs }; } finally { console.warn = orig; }
  };

  // ══════════════ a funcao das portas ══════════════

  await test('(a) liberou a reserva de uma TOTALMENTE_RESERVADA: recalcula -> APROVADO e devolve {de, para}', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    const [r] = await reservas(R);
    await liberar(r.id);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA', 'o motor sozinho nao recalcula (a C127)');
    const out = await rcs.recalcularRequisicoesDasReservas(db, [r.id], 'teste');
    assert.deepStrictEqual(out, [{ requisicao_id: R, de: 'TOTALMENTE_RESERVADA', para: 'APROVADO' }]);
    assert.strictEqual(await st(R), 'APROVADO');
  });

  await test('(b) reserva MANUAL (sem requisicao): devolve [] e o recalculo sob a trava nao e chamado nenhuma vez', async () => {
    const m = await material(5);
    const c = await request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 2 });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    await liberar(c.body.id);
    const spy = espiao();
    let out;
    try { out = await rcs.recalcularRequisicoesDasReservas(db, [c.body.id], 'teste'); } finally { spy.restaurar(); }
    assert.deepStrictEqual(out, []);
    assert.deepStrictEqual(spy.chamadas, [], 'zero chamadas (a reserva manual nao tem requisicao)');
  });

  await test('(b+) lista vazia ou nula: [] sem consultar nada', async () => {
    const spy = espiao();
    try {
      assert.deepStrictEqual(await rcs.recalcularRequisicoesDasReservas(db, [], 'teste'), []);
      assert.deepStrictEqual(await rcs.recalcularRequisicoesDasReservas(db, null, 'teste'), []);
    } finally { spy.restaurar(); }
    assert.deepStrictEqual(spy.chamadas, []);
  });

  await test('(c) duas reservas da MESMA requisicao na lista: uma chamada so do recalculo', async () => {
    const m1 = await material(4);
    const m2 = await material(3);
    const R = await reqPend([[m1, 4], [m2, 3]]);
    await aprovar(R);
    const rs = await reservas(R);
    assert.strictEqual(rs.length, 2);
    await liberar(rs[0].id);
    await liberar(rs[1].id);
    const spy = espiao();
    let out;
    try { out = await rcs.recalcularRequisicoesDasReservas(db, [rs[0].id, rs[1].id], 'teste'); } finally { spy.restaurar(); }
    assert.deepStrictEqual(spy.chamadas, [R], 'uma chamada, com o id da requisicao');
    assert.deepStrictEqual(out, [{ requisicao_id: R, de: 'TOTALMENTE_RESERVADA', para: 'APROVADO' }]);
  });

  await test('(c+) liberar a reserva de um de dois itens: TOTALMENTE -> PARCIALMENTE_RESERVADA', async () => {
    const m1 = await material(4);
    const m2 = await material(3);
    const R = await reqPend([[m1, 4], [m2, 3]]);
    await aprovar(R);
    const rs = await reservas(R);
    await liberar(rs[1].id);
    const out = await rcs.recalcularRequisicoesDasReservas(db, [rs[1].id], 'teste');
    assert.deepStrictEqual(out, [{ requisicao_id: R, de: 'TOTALMENTE_RESERVADA', para: 'PARCIALMENTE_RESERVADA' }]);
  });

  await test('(d) PARCIALMENTE_ATENDIDA (fora do conjunto recalculavel): [] e o status nao muda', async () => {
    const m = await material(10);
    const R = await reqPend([[m, 10, 4, 4]], 'PARCIALMENTE_ATENDIDA');
    const it = await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R]);
    const r = await stockService.criarReserva(db, ADMIN, { material_id: m, quantidade: 6 },
      { sistema: true, requisicao_id: R, item_requisicao_id: it.id });
    await liberar(r.id);
    assert.deepStrictEqual(await rcs.recalcularRequisicoesDasReservas(db, [r.id], 'teste'), []);
    assert.strictEqual(await st(R), 'PARCIALMENTE_ATENDIDA');
  });

  await test('(e) o recalculo de uma requisicao lanca: a funcao NAO lanca, devolve [] e avisa com a literal do contrato', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 4]]);
    await aprovar(R);
    const [r] = await reservas(R);
    await liberar(r.id);
    const orig = rcs.recalcularStatusSobTrava;
    rcs.recalcularStatusSobTrava = async () => { throw new Error('falha simulada 76'); };
    let res;
    try {
      res = await capturarWarn(async () => {
        try { return { out: await rcs.recalcularRequisicoesDasReservas(db, [r.id], 'teste') }; } catch (e) { return { lancou: e.message }; }
      });
    } finally { rcs.recalcularStatusSobTrava = orig; }
    assert.ok(!res.valor.lancou, `nao lanca (lancou: ${res.valor.lancou})`);
    assert.deepStrictEqual(res.valor.out, []);
    assert.ok(res.msgs.some((x) => x.includes(`[almoxarifado-reservas] recalculo do status apos teste falhou (requisicao ${R}): falha simulada 76`)),
      `warn: ${JSON.stringify(res.msgs)}`);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA', 'nada gravado');
  });

  await test('(e+) a consulta das requisicoes falha: a funcao NAO lanca, devolve [] e avisa com os ids das reservas', async () => {
    const dbQuebrado = { all: (sql, params, cb) => cb(new Error('banco simulado 76')), get: (sql, params, cb) => cb(new Error('banco simulado 76')) };
    const res = await capturarWarn(() => rcs.recalcularRequisicoesDasReservas(dbQuebrado, [11, 12], 'teste'));
    assert.deepStrictEqual(res.valor, []);
    assert.ok(res.msgs.some((x) => x.includes('[almoxarifado-reservas] recalculo do status apos teste falhou (reservas 11,12): banco simulado 76')),
      `warn: ${JSON.stringify(res.msgs)}`);
  });

  // ══════════════ a trava (RN-07) ══════════════

  // O calculo pos-aprovacao e segurado UMA vez (o primeiro a chamar e o recalculo sob a trava, que leu
  // hold 0); durante o portao uma nota do mesmo material (ou do outro material da requisicao) e
  // processada pela rota. Com a trava a nota espera; sem ela, reserva 4 e o recalculo atrasado grava a
  // leitura velha (APROVADO com hold 4 — a sonda76-corrida, 3/3).
  const corrida = async (R, reservaId, materialDaNota) => {
    const rec = await notaSemProcessar(materialDaNota, 4);
    let abrir; const portao = new Promise((r) => { abrir = r; });
    let chegou; const noPortao = new Promise((r) => { chegou = r; });
    const orig = rsm.calcularStatusPosAprovacao;
    let primeira = true;
    rsm.calcularStatusPosAprovacao = async (...a) => {
      if (primeira) { primeira = false; chegou(); await portao; }
      return orig(...a);
    };
    try {
      const pRecalc = rcs.recalcularRequisicoesDasReservas(db, [reservaId], 'teste');
      await comLimite(noPortao, 5000);
      const pNota = processar(rec);
      await Promise.race([pNota, dormir(300)]);
      abrir();
      const [out, nota] = await comLimite(Promise.all([pRecalc, pNota]));
      assert.strictEqual(nota.status, 200, JSON.stringify(nota.body));
      return out;
    } finally { rsm.calcularStatusPosAprovacao = orig; abrir(); }
  };

  await test('(f) RN-07 (a): liberar a mao x nota do MESMO material — o status final condiz com o hold (nunca APROVADO com hold 4)', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 8]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
    const [r] = await reservas(R);
    await liberar(r.id);
    await corrida(R, r.id, m);
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 4]);
  });

  await test('(g) RN-07 (b): requisicao de DOIS materiais M1 < M2, libera a de M1, a nota e de M2 — o status condiz com o hold', async () => {
    const m1 = await material(4);
    const m2 = await material(0);
    assert.ok(m1 < m2);
    const R = await reqPend([[m1, 4], [m2, 4]]);
    await aprovar(R);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA', 'M1 reservado, M2 sem saldo');
    const [r] = await reservas(R);
    assert.strictEqual(r.material_id, m1);
    await liberar(r.id);
    await corrida(R, r.id, m2);
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 4]);
  });

  await test('(f/g positiva) sem corrida o mesmo roteiro termina igual (APROVADO no recalculo, PARCIALMENTE depois da nota)', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 8]]);
    await aprovar(R);
    const [r] = await reservas(R);
    await liberar(r.id);
    assert.deepStrictEqual(await rcs.recalcularRequisicoesDasReservas(db, [r.id], 'teste'),
      [{ requisicao_id: R, de: 'PARCIALMENTE_RESERVADA', para: 'APROVADO' }]);
    const p = await processar(await notaSemProcessar(m, 4));
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.deepStrictEqual([await st(R), await hold(R)], ['PARCIALMENTE_RESERVADA', 4]);
  });

  await test('(i) dois itens do MESMO material: o recalculo pega a trava uma vez so (nao reentrante) e termina', async () => {
    const m = await material(4);
    const R = await reqPend([[m, 2], [m, 2]]);
    await aprovar(R);
    const rs = await reservas(R);
    assert.strictEqual(rs.length, 2, 'uma reserva por item');
    await liberar(rs[0].id);
    const out = await comLimite(rcs.recalcularRequisicoesDasReservas(db, [rs[0].id], 'teste'), 4000);
    assert.deepStrictEqual(out, [{ requisicao_id: R, de: 'TOTALMENTE_RESERVADA', para: 'PARCIALMENTE_RESERVADA' }]);
    // e a trava do material ficou livre: uma nota dele processa
    const p = await comLimite(processar(await notaSemProcessar(m, 2)), 4000);
    assert.strictEqual(p.status, 200);
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA', 'a nota reservou os 2 que faltavam');
  });

  await test('(i+) requisicao sem itens: recalcularStatusSobTrava devolve null sem travar', async () => {
    const R = await reqPend([]);
    assert.strictEqual(await comLimite(rcs.recalcularStatusSobTrava(db, R), 4000), null);
  });

  // ══════════════ carga fria (o ciclo de require) ══════════════

  await test('(h) carga fria nas tres ordens + uma DISTRIBUICAO com duas candidatas (o ciclo so quebra no sort)', async () => {
    // O require circular reservationService -> reservaChegadaService -> requisitionService nao lanca na
    // carga: guarda um `{}` velho e so quebra quando o sort(compararPrioridade) roda com >= 2 candidatas
    // (sonda76r-ciclo). Por isso cada ordem roda uma nota com duas requisicoes esperando.
    const raiz = path.join(__dirname, '../..');
    const svc = (n) => JSON.stringify(path.join(raiz, 'services/almoxarifado', n));
    const ordens = [
      ['requisitionService', 'reservaChegadaService', 'reservationService'],
      ['reservaChegadaService', 'reservationService', 'requisitionService'],
      ['reservationService', 'requisitionService', 'reservaChegadaService'],
    ];
    for (const ordem of ordens) {
      const js = `${ordem.map((n) => `require(${svc(n)});`).join('')}
        const rcs = require(${svc('reservaChegadaService')});
        if (typeof rcs.recalcularRequisicoesDasReservas !== 'function') throw new Error('rcs incompleto');
        if (typeof require(${svc('reservationService')}).processarExpiracao !== 'function') throw new Error('rs incompleto');
        if (typeof require(${svc('requisitionService')}).compararPrioridade !== 'function') throw new Error('req incompleto');
        const request = require('supertest');
        const { createTestApp } = require(${JSON.stringify(path.join(raiz, 'tests/helpers/testApp'))});
        const { dbRun, dbAll } = require(${svc('db')});
        (async () => {
          const { app, db } = await createTestApp({ user: { id: 1, nome: 'A', role: 'admin', is_superadmin: 1 } });
          const m = (await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico) VALUES ('C76','C76','PC',0,1,0)")).lastID;
          const rq = [];
          for (const h of ['08', '09']) {
            const id = (await dbRun(db, "INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo, data_aprovacao_valor) VALUES (?, 99, 'S', 'AGUARDANDO_ESTOQUE', 'NORMAL', ?, 1, '2026-09-01')", ['R' + h, '2026-09-01 ' + h + ':00:00'])).lastID;
            await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,4,0,0,0)', [id, m]);
            rq.push(id);
          }
          const rec = (await dbRun(db, "INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota) VALUES ('REC-C76', 'EM_ENTRADA_NF', 'NF-C76', 'F', '2026-09-01', '2026-09-02', 10)")).lastID;
          await dbRun(db, 'INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,8,8)', [rec, m]);
          const p = await request(app).post('/api/almoxarifado/recebimentos/' + rec + '/processar').send({});
          const holds = [];
          for (const id of rq) holds.push((await dbAll(db, "SELECT COALESCE(SUM(quantidade),0) h FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [id]))[0].h);
          console.log('RESULTADO ' + p.status + ' ' + holds.join('/'));
          process.exit(0);
        })().catch((e) => { console.log('QUEBROU ' + e.message); process.exit(1); });`;
      let out;
      try {
        out = execFileSync(process.execPath, ['-e', js], { encoding: 'utf8', cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      } catch (e) {
        out = `${e.stdout || ''}\n${String(e.stderr || '').split('\n').filter((l) => /Error|QUEBROU/.test(l)).slice(0, 2).join(' | ')}`;
      }
      const linha = out.split('\n').find((l) => l.startsWith('RESULTADO'));
      assert.strictEqual(linha, 'RESULTADO 200 4/4', `${ordem.join(' -> ')}: ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
