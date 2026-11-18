/**
 * Etapa 242 (C541) — a posicao do cliente diz o LIVRE de cada material (a regua do motor: o mesmo `livre_do_material` da lista de lotes) e
 * PARA QUAL OS esta reservado (`reservas: [{ os, quantidade }]`). A janela "Devolver ao cliente" avisa antes de o motor recusar.
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa242-aviso-reservado-para-os.md (RN-242.01, RN-242.05).
 * Executar: cd server && node tests/api/posicaoClienteReservadoParaOs.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 242', role: 'admin', is_superadmin: 1, email: 'a242@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 242: o livre e as reservas por OS na posicao do cliente ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };
  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente 242 LTDA'])).lastID;
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-13')`);
  const os = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-242-CAD', 'em_andamento')")).lastID;

  const material = async ({ negativo = 0, lote = 0 } = {}) => {
    const c = `E242-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, proprietario_cliente_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?, ?)`, [c, `Mat ${c}`, lote, negativo, cli])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, qtd, lote) => ok(request(app).post(`${API}/movimentacoes/v2`).send({
    material_id: m.id, tipo: 'ENTRADA', quantidade: qtd, motivo: 'e242', ...(lote ? { lote } : {}),
  }), 201);
  const reservar = async (m, qtd, osRef) => (await ok(request(app).post(`${API}/reservas`).send({
    material_id: m.id, quantidade: qtd, ...(osRef ? { os_referencia: osRef } : {}), observacoes: 'e242',
  }), 201)).body;
  const ultimaReserva = async (m) => (await new Promise((res, rej) => db.get(
    'SELECT id FROM reservas_material_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m.id], (e, r) => (e ? rej(e) : res(r)))));
  const itemDa = async (m) => {
    const r = await ok(request(app).get(`${API}/materiais-cliente/posicao?cliente_id=${cli}`));
    const i = r.body.itens.find((x) => x.material_id === m.id);
    assert.ok(i, `material ${m.codigo} na posicao`);
    return i;
  };
  const lotes = async (m) => (await ok(request(app).get(`${API}/materiais/${m.id}/lotes?com_saldo=1`))).body;
  const devolver = (m, qtd) => request(app).post(`${API}/materiais-cliente/devolucoes`).send({
    material_id: m.id, quantidade: qtd, documento_devolucao: `DEV-242-${++seq}`,
  });

  await test('[RN-242.01] sem reserva: livre = saldo e reservas vazia', async () => {
    const m = await material();
    await entrar(m, 5);
    const i = await itemDa(m);
    assert.strictEqual(i.livre, 5);
    assert.deepStrictEqual(i.reservas, []);
    assert.strictEqual(i.saldo, 5);
  });

  await test('[RN-242.01] reservas por OS: a OS cadastrada pelo numero, a digitada pelo texto, a sem OS com os null; livre = o resto', async () => {
    const m = await material();
    await entrar(m, 10);
    await reservar(m, 3, 'qualquer texto');
    // a reserva da OS cadastrada (como a do recebimento com OS): o numero da OS vence o texto
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET os_id = ? WHERE id = ?', [os, (await ultimaReserva(m)).id]);
    await reservar(m, 2, 'OS-DIGITADA');
    await reservar(m, 1, 'OS-DIGITADA');
    await reservar(m, 1, null);
    const i = await itemDa(m);
    assert.strictEqual(i.livre, 3);
    assert.deepStrictEqual(i.reservas, [
      { os: 'OS-242-CAD', projeto: null, quantidade: 3 }, { os: 'OS-DIGITADA', projeto: null, quantidade: 3 },
      { os: null, projeto: null, quantidade: 1 },
    ]);
  });

  await test('[RN-242.01] reserva de projeto (sem OS): sai com o nome do projeto, nao somada ao "sem OS" (Fase 5, achado 2)', async () => {
    const m = await material();
    await entrar(m, 10);
    const prj = (await dbRun(db, "INSERT INTO projetos (cliente_id, nome, status) VALUES (?, 'Projeto 242', 'ativo')", [cli])).lastID;
    await reservar(m, 2, null);
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET projeto_id = ? WHERE id = ?', [prj, (await ultimaReserva(m)).id]);
    await reservar(m, 1, null);
    await reservar(m, 4, 'OS-COM-PROJETO');
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET projeto_id = ? WHERE id = ?', [prj, (await ultimaReserva(m)).id]);
    const i = await itemDa(m);
    assert.deepStrictEqual(i.reservas, [
      { os: 'OS-COM-PROJETO', projeto: null, quantidade: 4 },
      { os: null, projeto: 'Projeto 242', quantidade: 2 },
      { os: null, projeto: null, quantidade: 1 },
    ]);
  });

  await test('[RN-242.01] so as ATIVAS e so o resto (quantidade - utilizada)', async () => {
    const m = await material();
    await entrar(m, 10);
    await reservar(m, 4, 'OS-RESTO');
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade_utilizada = 1 WHERE id = ?', [(await ultimaReserva(m)).id]);
    await reservar(m, 2, 'OS-MORTA');
    await dbRun(db, "UPDATE reservas_material_almoxarifado SET status = 'CANCELADA' WHERE id = ?", [(await ultimaReserva(m)).id]);
    await reservar(m, 2, 'OS-GASTA');
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET quantidade_utilizada = 2 WHERE id = ?', [(await ultimaReserva(m)).id]);
    const i = await itemDa(m);
    assert.deepStrictEqual(i.reservas, [{ os: 'OS-RESTO', projeto: null, quantidade: 3 }]);
  });

  await test('[RN-242.01] o livre e o mesmo livre_do_material da lista de lotes (inclusive com caixa separada sem reserva)', async () => {
    const m = await material({ lote: 1 });
    await entrar(m, 6, 'L1');
    await reservar(m, 2, 'OS-LOTE');
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'x', 'EM_SEPARACAO')`, [`RQ-242-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada)
      VALUES (?, ?, 1, 1)`, [rq, m.id]);
    const i = await itemDa(m);
    const l1 = (await lotes(m)).find((l) => l.codigo === 'L1');
    assert.strictEqual(l1.livre_do_material, 3, 'a regua de referencia (6 - 2 reservados - 1 separado)');
    assert.strictEqual(i.livre, l1.livre_do_material);
  });

  await test('[RN-242.01] reservado acima do fisico (legado): livre 0, nunca negativo', async () => {
    const m = await material();
    await entrar(m, 3);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 5 WHERE id = ?', [m.id]);
    assert.strictEqual((await itemDa(m)).livre, 0);
  });

  await test('[RN-242.01] saldo negativo permitido (material ou global): livre null; as reservas continuam ditas', async () => {
    const m = await material({ negativo: 1 });
    await entrar(m, 3);
    await reservar(m, 3, 'OS-NEG');
    const i = await itemDa(m);
    assert.strictEqual(i.livre, null);
    assert.deepStrictEqual(i.reservas, [{ os: 'OS-NEG', projeto: null, quantidade: 3 }]);
    const g = await material();
    await entrar(g, 3);
    await reservar(g, 3, 'OS-GLOBAL');
    await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor = '1' WHERE chave = 'permite_saldo_negativo_global'");
    try {
      assert.strictEqual((await itemDa(g)).livre, null);
    } finally {
      await dbRun(db, "UPDATE configuracoes_almoxarifado SET valor = '0' WHERE chave = 'permite_saldo_negativo_global'");
    }
  });

  await test('[RN-242.05] integracao: devolver o livre da posicao sai (201); livre + 1 e recusado com o livre na mensagem', async () => {
    const m = await material();
    await entrar(m, 5);
    await reservar(m, 3, 'OS-INT');
    const i = await itemDa(m);
    assert.strictEqual(i.livre, 2);
    const r = await devolver(m, i.livre + 1);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Saldo insuficiente. Disponível: ${i.livre} UN`);
    await ok(devolver(m, i.livre), 201);
    assert.strictEqual((await itemDa(m)).livre, 0);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
