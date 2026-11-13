/**
 * Etapa 224 (T1) — o extrato diz qual lote esta impedido (C528; RN-224.01 a .07).
 *
 * As linhas de saldo por localizacao (`saldos_localizacao` do extrato e `GET /estoque/:id/saldos`, a mesma
 * `stockService.consultarSaldosPorLocalizacao`) ganham a situacao crua do lote (`lote_status`, `lote_validade`,
 * `lote_vencimento_liberado_em`) e dois booleanos da regua (`lote_esta_impedido`, `lote_vencido_sem_liberacao`), falsos sem lote; com o controle de
 * lote desligado a linha ainda diz (B1484, B1485 — o motor recusa a saida do lote).
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa224-extrato-qual-lote-impedido.md
 *
 * Executar: cd server && node tests/api/extratoQualLoteImpedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { predicadoLoteImpedidoSql, predicadoLoteVencidoSql } = require('../../services/almoxarifado/loteImpedido');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 224', role: 'admin', is_superadmin: 1, email: 'a224@t.com' };
const API = '/api/almoxarifado';
const dia = (n) => diaLocal.somarDiasISO(diaLocal.hojeLocalISO(), n);
const CAMPOS = ['lote_status', 'lote_validade', 'lote_vencimento_liberado_em', 'lote_esta_impedido', 'lote_vencido_sem_liberacao'];
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 224: o extrato diz qual lote esta impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const get = (u) => request(app).get(u);
  const post = (u, b = {}) => request(app).post(u).send(b);
  const put = (u, b = {}) => request(app).put(u).send(b);
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [ADMIN.id, ADMIN.nome, ADMIN.email]);

  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM224', nome: 'Almox 224' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z224-01', descricao: 'Z224-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z224-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E224-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
  };
  const entrar = (m, q, lote) => ok(post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e224', localizacao_destino_id: P01.id, ...(lote ? { lote } : {}) }), 201);
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m, codigo])).id;
  const status = async (m, codigo, st) => ok(put(`${API}/lotes/${await loteId(m, codigo)}/status`,
    { status: st, justificativa: 'teste 224' }));
  const validade = async (m, codigo, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, codigo)]);
  const extrato = async (m) => (await ok(get(`${API}/materiais/${m}/extrato`))).body;
  const linhas = async (m) => {
    const ls = (await extrato(m)).saldos_localizacao;
    for (const l of ls) for (const c of CAMPOS) assert.ok(Object.prototype.hasOwnProperty.call(l, c), `a linha nao trouxe ${c}`);
    return ls;
  };
  const doLote = (ls, codigo) => {
    const l = ls.filter((x) => x.lote === codigo);
    assert.strictEqual(l.length, 1, `linhas do lote ${codigo}: ${JSON.stringify(ls)}`);
    return l[0];
  };
  const l1l2 = async (opts) => {
    const m = await material(opts);
    await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2');
    return m;
  };
  const vistos = [];

  // ── RN-224.00 — a regua continua a mesma ──────────────────────────────────────────────────────────────────────────
  await test('[RN-224.00] predicadoLoteImpedidoSql monta o mesmo texto de antes, com a parte vencida extraida', async () => {
    const h = '2026-11-13';
    const antes = `(COALESCE(l.status,'') <> 'ATIVO' OR (COALESCE(l.data_validade,'') <> ''`
      + ` AND substr(l.data_validade,1,10) < '${h}' AND COALESCE(l.vencimento_liberado_em,'') = ''))`;
    assert.strictEqual(predicadoLoteImpedidoSql('l', h), antes);
    assert.strictEqual(predicadoLoteVencidoSql('l', h), `(COALESCE(l.data_validade,'') <> ''`
      + ` AND substr(l.data_validade,1,10) < '${h}' AND COALESCE(l.vencimento_liberado_em,'') = '')`);
    assert.throws(() => predicadoLoteVencidoSql('l', "2026-11-13' OR 1=1"), /hoje inválido/);
  });

  // ── RN-224.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-224.01] L1 ATIVO 4 + L2 BLOQUEADO 6: a linha L2 impedida, a L1 nao', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO'); vistos.push(m);
    const ls = await linhas(m);
    const l2 = doLote(ls, 'L2'); const l1 = doLote(ls, 'L1');
    assert.strictEqual(l2.lote_status, 'BLOQUEADO');
    assert.strictEqual(l2.lote_esta_impedido, true);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, false);
    assert.strictEqual(Number(l2.quantidade), 6);
    assert.strictEqual(l1.lote_status, 'ATIVO');
    assert.strictEqual(l1.lote_esta_impedido, false);
    assert.strictEqual(l1.lote_vencido_sem_liberacao, false);
    assert.strictEqual(Number(l1.quantidade), 4);
  });

  // ── RN-224.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-224.02 a] L2 REPROVADO -> impedido, nao vencido', async () => {
    const m = await l1l2(); await status(m, 'L2', 'REPROVADO'); vistos.push(m);
    const l2 = doLote(await linhas(m), 'L2');
    assert.strictEqual(l2.lote_status, 'REPROVADO');
    assert.strictEqual(l2.lote_esta_impedido, true);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, false);
  });
  await test('[RN-224.02 b] L2 ATIVO vencido ontem -> impedido e vencido, com a data', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1)); vistos.push(m);
    const l2 = doLote(await linhas(m), 'L2');
    assert.strictEqual(l2.lote_status, 'ATIVO');
    assert.strictEqual(l2.lote_esta_impedido, true);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, true);
    assert.strictEqual(String(l2.lote_validade).slice(0, 10), dia(-1));
    assert.strictEqual(l2.lote_vencimento_liberado_em, null);
  });
  await test('[RN-224.02 c] vencido com o vencimento liberado -> nada impedido, a liberacao vem', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1)); vistos.push(m);
    await ok(put(`${API}/lotes/${await loteId(m, 'L2')}/liberar-vencimento`, { justificativa: 'teste 224' }));
    const l2 = doLote(await linhas(m), 'L2');
    assert.strictEqual(l2.lote_esta_impedido, false);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, false);
    assert.ok(l2.lote_vencimento_liberado_em, 'sem lote_vencimento_liberado_em');
  });
  await test('[RN-224.02 d] o lote que vence hoje ainda nao esta vencido', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(0)); vistos.push(m);
    const l2 = doLote(await linhas(m), 'L2');
    assert.strictEqual(l2.lote_esta_impedido, false);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, false);
  });
  await test('[RN-224.02 e] BLOQUEADO e vencido ontem (validade com hora) -> os dois', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO'); await validade(m, 'L2', `${dia(-1)} 00:00:00`); vistos.push(m);
    const l2 = doLote(await linhas(m), 'L2');
    assert.strictEqual(l2.lote_status, 'BLOQUEADO');
    assert.strictEqual(l2.lote_esta_impedido, true);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, true);
  });

  // ── RN-224.03 / .04 ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-224.03] linha sem lote num material com controle de lote: tudo nulo e falso', async () => {
    const m = await material({ lote: 0 }); await entrar(m, 3, null); vistos.push(m);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m]);
    const ls = await linhas(m);
    assert.ok(ls.length >= 1, 'premissa: ha linha de saldo');
    for (const l of ls) {
      assert.strictEqual(l.lote_id, null);
      assert.strictEqual(l.lote, null);
      assert.strictEqual(l.lote_status, null);
      assert.strictEqual(l.lote_validade, null);
      assert.strictEqual(l.lote_vencimento_liberado_em, null);
      assert.strictEqual(l.lote_esta_impedido, false);
      assert.strictEqual(l.lote_vencido_sem_liberacao, false);
    }
  });
  await test('[RN-224.04] sem controle de lote, lote BLOQUEADO e vencido: a linha ainda diz (o motor recusa a saida dele), o cartao 0', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); vistos.push(m);
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO', data_validade = ? WHERE material_id = ?", [dia(-1), m]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m]);
    const body = await extrato(m);
    const l2 = doLote(await linhas(m), 'L2');
    assert.strictEqual(l2.lote_status, 'BLOQUEADO');
    assert.strictEqual(l2.lote_esta_impedido, true);
    assert.strictEqual(l2.lote_vencido_sem_liberacao, true);
    assert.strictEqual(body.material.lote_impedido, 0, 'o cartao continua 0 (B1371, C530)');
    // Fase 2 I1: a premissa da B1485 — o motor recusa a saida que cita o lote, com o controle desligado.
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'e224',
      localizacao_origem_id: P01.id, lote: 'L2', justificativa: 'teste 224 saida do lote bloqueado' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(String(r.body.error), /L2.*bloqueado/i);
  });

  // ── RN-224.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-224.05] /estoque/:id/saldos traz os mesmos cinco campos, iguais aos do extrato', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO'); await validade(m, 'L1', dia(-2)); vistos.push(m);
    const ext = await linhas(m);
    for (const q of ['', '?requisicao_id=999999']) {
      const sal = (await ok(get(`${API}/estoque/${m}/saldos${q}`))).body;
      assert.strictEqual(sal.length, ext.length);
      for (const s of sal) {
        const e = ext.find((x) => x.id === s.id);
        assert.ok(e, `linha ${s.id} sem par no extrato`);
        for (const c of CAMPOS) assert.deepStrictEqual(s[c], e[c], `${c} da linha ${s.id}${q}`);
        assert.ok(['separado_outras', 'sobra', 'lote_livre'].every((k) => Object.prototype.hasOwnProperty.call(s, k)),
          `a linha perdeu os campos de antes: ${JSON.stringify(s)}`);
      }
      assert.strictEqual(doLote(sal, 'L2').lote_esta_impedido, true);
      assert.strictEqual(doLote(sal, 'L1').lote_vencido_sem_liberacao, true);
    }
  });

  // ── RN-224.07 (integracao) ────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-224.07 a] liberar o lote (status ATIVO) apaga a situacao da linha e zera o cartao', async () => {
    const m = await l1l2(); await status(m, 'L2', 'BLOQUEADO'); vistos.push(m);
    let body = await extrato(m);
    assert.strictEqual(doLote(body.saldos_localizacao, 'L2').lote_esta_impedido, true);
    assert.strictEqual(body.material.lote_impedido, 6);
    await status(m, 'L2', 'ATIVO');
    body = await extrato(m);
    assert.strictEqual(doLote(body.saldos_localizacao, 'L2').lote_esta_impedido, false);
    assert.strictEqual(body.material.lote_impedido, 0);
    const sal = (await ok(get(`${API}/estoque/${m}/saldos`))).body;
    assert.strictEqual(doLote(sal, 'L2').lote_esta_impedido, false);
  });
  await test('[RN-224.07 b] liberar o vencimento apaga a situacao da linha e zera o cartao', async () => {
    const m = await l1l2(); await validade(m, 'L2', dia(-1)); vistos.push(m);
    let body = await extrato(m);
    assert.strictEqual(doLote(body.saldos_localizacao, 'L2').lote_vencido_sem_liberacao, true);
    assert.strictEqual(body.material.lote_impedido, 6);
    await ok(put(`${API}/lotes/${await loteId(m, 'L2')}/liberar-vencimento`, { justificativa: 'teste 224' }));
    body = await extrato(m);
    assert.strictEqual(doLote(body.saldos_localizacao, 'L2').lote_vencido_sem_liberacao, false);
    assert.strictEqual(doLote(body.saldos_localizacao, 'L2').lote_esta_impedido, false);
    assert.strictEqual(body.material.lote_impedido, 0);
  });

  // ── RN-224.06 — toda linha e a regua ──────────────────────────────────────────────────────────────────────────────
  await test('[RN-224.06] em toda linha de todo material criado, os booleanos sao a regua', async () => {
    let conferidas = 0; let impedidas = 0;
    for (const m of vistos) {
      for (const l of await linhas(m)) {
        let imp = false; let venc = false;
        if (l.lote_id != null) {
          const r = await dbGet(db, `SELECT (${predicadoLoteImpedidoSql('lt')}) AS i, (${predicadoLoteVencidoSql('lt')}) AS v
            FROM lotes_almoxarifado lt WHERE lt.id = ?`, [l.lote_id]);
          imp = r.i === 1; venc = r.v === 1;
        }
        assert.strictEqual(l.lote_esta_impedido, imp, `impedido da linha ${l.id}`);
        assert.strictEqual(l.lote_vencido_sem_liberacao, venc, `vencido da linha ${l.id}`);
        conferidas++; if (imp) impedidas++;
      }
    }
    assert.ok(conferidas >= 20 && impedidas >= 5, `poucas linhas: ${conferidas} conferidas, ${impedidas} impedidas`);
  });

  terminou = true;
  await close();
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
