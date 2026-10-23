/**
 * Etapa 187, T2 — a restricao da manutencao aparece na lista de ferramentas (RN-187.05..07, B1244-B1247).
 * Cada cenario cita a RN do plano
 * docs/superpowers/plans/2026-10-22-almoxarifado-etapa187-ferramenta-baixada-e-restricao-da-manutencao.md
 * (com as emendas da Fase 2: I2 — a manutencao aberta com restricao; I4 — a baixada com restricao, pela rota).
 *
 * Executar: cd server && node tests/api/toolRestricaoDaManutencao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { emprestarComTermo } = require('../helpers/termoFerramenta');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 4, nome: 'Gestor', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
  }
}

let seq = 0;
async function novaFerramenta(db) {
  seq += 1;
  return (await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status, exige_calibracao)
    VALUES (?, ?, 'DISPONIVEL', 0)`, [`FER-187-${seq}`, `Torquímetro 187-${seq}`])).lastID;
}

/** Manutencao pela ROTA (abre e conclui), devolve o id da manutencao. */
async function manutencaoConcluida(app, fid, corpo) {
  const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).send({ descricao: 'Revisao' }).expect(201);
  const r = await request(app).put(`/api/almoxarifado/manutencoes/${m.body.id}/concluir`).send(corpo);
  assert.strictEqual(r.status, 200, `concluir: ${r.status} ${JSON.stringify(r.body)}`);
  return m.body.id;
}
const LEVE = { condicao: 'COM_RESTRICAO', destino: 'USO', observacoes: 'Só para serviço leve' };

/** A restricao esperada a partir da linha relida (data_fim como gravado). */
async function esperada(db, mid) {
  const m = await dbGet(db, 'SELECT id, observacoes, data_fim FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [mid]);
  return { manutencao_id: m.id, observacoes: m.observacoes, data_fim: m.data_fim };
}

/** GET /ferramentas como `user` (volta ao ADMIN depois), devolve { corpo, item(fid) }. */
async function listar(app, setUser, user, fid) {
  setUser(user);
  const r = await request(app).get('/api/almoxarifado/ferramentas');
  setUser(ADMIN);
  assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
  const f = r.body.find((x) => x.id === fid);
  assert.ok(f, `ferramenta ${fid} fora da lista`);
  return { corpo: r.body, f };
}

/** Manutencao gravada a mao (para o empate e para a aberta). */
const manutencaoAMao = (db, fid, { data_fim = null, condicao = null, observacoes = null }) => dbRun(db, `INSERT INTO
  manutencoes_ferramenta_almoxarifado (ferramenta_id, descricao, data_fim, condicao_retorno, observacoes)
  VALUES (?, 'a mao', ?, ?, ?)`, [fid, data_fim, condicao, observacoes]).then((r) => r.lastID);

(async () => {
  // ── RN-187.05 — a ultima concluida que declarou condicao decide ────────────────────────────
  await test('[RN-187.05a] COM_RESTRICAO/USO "Só para serviço leve" -> restricao com as tres chaves; status DISPONIVEL', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    const mid = await manutencaoConcluida(app, fid, LEVE);
    const { f } = await listar(app, setUser, ALMOXARIFE, fid);
    assert.strictEqual(f.status, 'DISPONIVEL');
    assert.ok((await esperada(db, mid)).data_fim, 'premissa: data_fim gravado');
    assert.deepStrictEqual(f.restricao, await esperada(db, mid));
    assert.strictEqual(f.restricao.observacoes, 'Só para serviço leve');
    await close();
  });

  await test('[RN-187.05b] nova manutencao concluida OK -> restricao null (antes dela, estava la)', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    const mid = await manutencaoConcluida(app, fid, LEVE);
    assert.deepStrictEqual((await listar(app, setUser, ALMOXARIFE, fid)).f.restricao, await esperada(db, mid));
    await manutencaoConcluida(app, fid, { condicao: 'OK', destino: 'USO' });
    assert.strictEqual((await listar(app, setUser, ALMOXARIFE, fid)).f.restricao, null);
    await close();
  });

  await test('[RN-187.05c] nova COM_RESTRICAO "Sem impacto" -> a nova substitui', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    await manutencaoConcluida(app, fid, LEVE);
    const mid2 = await manutencaoConcluida(app, fid, { condicao: 'COM_RESTRICAO', destino: 'USO', observacoes: 'Sem impacto' });
    const { f } = await listar(app, setUser, ALMOXARIFE, fid);
    assert.strictEqual(f.restricao.observacoes, 'Sem impacto');
    assert.strictEqual(f.restricao.manutencao_id, mid2);
    await close();
  });

  await test('[RN-187.05d] concluida sem condicao (corpo vazio, B1140) nao apaga a restricao anterior', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    const mid = await manutencaoConcluida(app, fid, LEVE);
    const mid2 = await manutencaoConcluida(app, fid, {});
    assert.strictEqual((await dbGet(db, 'SELECT condicao_retorno c FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [mid2])).c, null,
      'premissa: a concluida de corpo vazio tem condicao NULL');
    const { f } = await listar(app, setUser, ALMOXARIFE, fid);
    assert.deepStrictEqual(f.restricao, await esperada(db, mid));
    await close();
  });

  await test('[RN-187.05e] empate no data_fim: vale a de id maior (nos dois sentidos)', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fa = await novaFerramenta(db);
    await manutencaoAMao(db, fa, { data_fim: '2026-10-22 10:00:00', condicao: 'OK' });
    const maior = await manutencaoAMao(db, fa, { data_fim: '2026-10-22 10:00:00', condicao: 'COM_RESTRICAO', observacoes: 'Empate restrito' });
    const fb = await novaFerramenta(db);
    await manutencaoAMao(db, fb, { data_fim: '2026-10-22 10:00:00', condicao: 'COM_RESTRICAO', observacoes: 'Empate antigo' });
    await manutencaoAMao(db, fb, { data_fim: '2026-10-22 10:00:00', condicao: 'OK' });
    const a = (await listar(app, setUser, ALMOXARIFE, fa)).f;
    assert.deepStrictEqual(a.restricao, { manutencao_id: maior, observacoes: 'Empate restrito', data_fim: '2026-10-22 10:00:00' });
    const b = (await listar(app, setUser, ALMOXARIFE, fb)).f;
    assert.strictEqual(b.restricao, null);
    await close();
  });

  await test('[RN-187.05f] manutencao ABERTA com COM_RESTRICAO (unica com condicao) -> null (I2, o caso que discrimina)', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    await manutencaoAMao(db, fid, { condicao: 'COM_RESTRICAO', observacoes: 'Aberta restrita' });
    assert.strictEqual((await listar(app, setUser, ALMOXARIFE, fid)).f.restricao, null);
    await close();
  });

  await test('[RN-187.05f] aberta OK sobre concluida restrita -> a restricao continua; sem manutencao -> null', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    const mid = await manutencaoConcluida(app, fid, LEVE);
    await manutencaoAMao(db, fid, { condicao: 'OK' });
    assert.deepStrictEqual((await listar(app, setUser, ALMOXARIFE, fid)).f.restricao, await esperada(db, mid));
    const limpa = await novaFerramenta(db);
    assert.strictEqual((await listar(app, setUser, ALMOXARIFE, limpa)).f.restricao, null);
    await close();
  });

  await test('[RN-187.05f] BAIXADA com restricao (COM_RESTRICAO + BAIXA pela rota, I4) -> o servidor devolve a restricao', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    const mid = await manutencaoConcluida(app, fid, { condicao: 'COM_RESTRICAO', destino: 'BAIXA', observacoes: 'Só para serviço leve' });
    const { f } = await listar(app, setUser, ALMOXARIFE, fid);
    assert.strictEqual(f.status, 'BAIXADA');
    assert.deepStrictEqual(f.restricao, await esperada(db, mid));
    await close();
  });

  // ── RN-187.06 — quem nao gerencia ve a restricao por lista branca; a 181 nao regride ───────
  for (const [quem, user] of [['PRODUCAO', PRODUCAO], ['GESTOR', GESTOR], ['ALMOXARIFE', ALMOXARIFE], ['ADMIN', ADMIN]]) {
    await test(`[RN-187.06] ${quem}: restricao com exatamente as tres chaves; emprestimo_aberto sem colaborador para quem nao gerencia`, async () => {
      const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
      const fid = await novaFerramenta(db);
      const mid = await manutencaoConcluida(app, fid, LEVE);
      const col = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('CARLOS LIMA', 'C-9', '12312312399', 'ativo', 'Montagem')")).lastID;
      const fEmp = (await dbRun(db, "INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status) VALUES ('PAT-187-E', 'Furadeira', 'EMPRESTADA')")).lastID;
      const emp = (await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado (ferramenta_id, colaborador_id, colaborador_nome, setor, status, data_prevista_devolucao)
        VALUES (?, ?, 'CARLOS LIMA', 'Montagem', 'EMPRESTADA', '2026-11-05')`, [fEmp, col])).lastID;
      const { corpo, f } = await listar(app, setUser, user, fid);
      assert.deepStrictEqual(f.restricao, await esperada(db, mid));
      assert.deepStrictEqual(Object.keys(f.restricao).sort(), ['data_fim', 'manutencao_id', 'observacoes']);
      if (quem === 'PRODUCAO' || quem === 'GESTOR') {
        assert.deepStrictEqual(corpo.find((x) => x.id === fEmp).emprestimo_aberto, { id: emp, data_prevista_devolucao: '2026-11-05' });
        assert.ok(!JSON.stringify(corpo).includes('CARLOS'), 'o nome do colaborador vazou na lista');
      } else {
        assert.strictEqual(corpo.find((x) => x.id === fEmp).emprestimo_aberto.colaborador_nome, 'CARLOS LIMA');
      }
      await close();
    });
  }

  // ── RN-187.07 — a restricao nao bloqueia o emprestimo ──────────────────────────────────────
  await test('[RN-187.07] emprestar a restrita -> 201, EMPRESTADA, e a lista ainda traz a restricao', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
    const fid = await novaFerramenta(db);
    const mid = await manutencaoConcluida(app, fid, LEVE);
    const r = await emprestarComTermo(app, db, fid, { colaborador_nome: 'Ana Restrita' });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    const { f } = await listar(app, setUser, ALMOXARIFE, fid);
    assert.strictEqual(f.status, 'EMPRESTADA');
    assert.deepStrictEqual(f.restricao, await esperada(db, mid));
    await close();
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})();
