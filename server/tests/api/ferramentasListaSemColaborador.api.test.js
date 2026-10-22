/**
 * Etapa 181 (Fase 5, revisao adversarial, I2) — a lista de ferramentas nao diz com quem a ferramenta esta para quem nao
 * gerencia ferramentas.
 *
 * `GET /ferramentas` (so `auth`) devolvia `emprestimo_aberto.colaborador_nome` a qualquer usuario do modulo — o mesmo dado que
 * `GET /emprestimos` (desde a 180) e o relatorio `ferramentas-emprestadas` (desde a 181) restringem a `gerenciar_ferramentas`.
 * Agora, sem `gerenciar_ferramentas`, o `emprestimo_aberto` vem so com `id` e `data_prevista_devolucao` (o status da
 * ferramenta continua EMPRESTADA): sem `colaborador_nome`, `colaborador_id`, `setor`.
 *
 * Executar: cd server && node tests/api/ferramentasListaSemColaborador.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 4, nome: 'Gestor', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser } = t;
  wrapDatabase(db);

  const col = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('CARLOS LIMA', 'C-9', '12312312399', 'ativo', 'Montagem')")).lastID;
  const fEmp = (await dbRun(db, "INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, tipo, status) VALUES ('PAT-L-1', 'Furadeira', 'Elétrica', 'EMPRESTADA')")).lastID;
  const fLivre = (await dbRun(db, "INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, tipo, status) VALUES ('PAT-L-2', 'Esmerilhadeira', 'Elétrica', 'DISPONIVEL')")).lastID;
  const emp = (await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado (ferramenta_id, colaborador_id, colaborador_nome, setor, status, data_prevista_devolucao)
    VALUES (?, ?, 'CARLOS LIMA', 'Montagem', 'EMPRESTADA', '2026-11-05')`, [fEmp, col])).lastID;

  const listar = async () => {
    const r = await request(app).get('/api/almoxarifado/ferramentas');
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const por = (id) => r.body.find((f) => f.id === id);
    assert.ok(por(fEmp) && por(fLivre), JSON.stringify(r.body));
    return { corpo: r.body, emp: por(fEmp), livre: por(fLivre) };
  };

  for (const [quem, user] of [['PRODUCAO', PRODUCAO], ['GESTOR', GESTOR]]) {
    await test(`${quem}: a emprestada continua EMPRESTADA com id e data prevista, sem nome, id ou setor do colaborador`, async () => {
      setUser(user);
      const { corpo, emp: f, livre } = await listar();
      setUser(ADMIN);
      assert.strictEqual(f.status, 'EMPRESTADA');
      assert.deepStrictEqual(f.emprestimo_aberto, { id: emp, data_prevista_devolucao: '2026-11-05' });
      assert.strictEqual(livre.emprestimo_aberto, null);
      assert.ok(!JSON.stringify(corpo).includes('CARLOS'), 'o nome vazou na lista');
      assert.ok(!JSON.stringify(corpo).includes('Montagem'), 'o setor do colaborador vazou na lista');
    });
  }

  for (const [quem, user] of [['ALMOXARIFE', ALMOXARIFE], ['ADMIN', ADMIN]]) {
    await test(`${quem} (gerenciar_ferramentas): ve com quem a ferramenta esta`, async () => {
      setUser(user);
      const { emp: f } = await listar();
      setUser(ADMIN);
      assert.strictEqual(f.emprestimo_aberto.id, emp);
      assert.strictEqual(f.emprestimo_aberto.colaborador_nome, 'CARLOS LIMA');
      assert.strictEqual(f.emprestimo_aberto.data_prevista_devolucao, '2026-11-05');
    });
  }

  console.log(`\nferramentasListaSemColaborador: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
