/**
 * Etapa 187, T1 — a ferramenta baixada nao e calibrada nem editada (RN-187.01..04, B1240-B1243).
 * Cada cenario cita a RN do plano
 * docs/superpowers/plans/2026-10-22-almoxarifado-etapa187-ferramenta-baixada-e-restricao-da-manutencao.md.
 *
 * Executar: cd server && node tests/api/toolBaixadaNaoCalibraNemEdita.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const toolService = require('../../services/almoxarifado/toolService');

const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };

const FRASE_CAL = 'Ferramenta baixada não pode ser calibrada (Torquímetro 187)';
const FRASE_EDI = 'Ferramenta baixada não pode ser editada (Torquímetro 187)';

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novaFerramenta(db, extra = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, status, exige_calibracao) VALUES (?,?,?,1)`,
    [extra.codigo || `FER-187-${seq}`, extra.nome || 'Torquímetro 187', extra.status || 'DISPONIVEL']);
  return r.lastID;
}

/** Baixada pela ROTA: manutencao -> concluir INSERVIVEL + BAIXA (o claim de verdade). */
async function baixadaPelaRota(app, db) {
  const fid = await novaFerramenta(db);
  const m = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/manutencoes`).send({ descricao: 'Revisao' }).expect(201);
  await request(app).put(`/api/almoxarifado/manutencoes/${m.body.id}/concluir`)
    .send({ condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }).expect(200);
  assert.strictEqual((await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid])).status, 'BAIXADA');
  return fid;
}

const calibrar = (app, fid, cal = '2026-01-01', val = '2030-01-01') => request(app)
  .post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
  .field('data_calibracao', cal).field('data_validade', val)
  .attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf');
const editar = (app, fid, corpo) => request(app).put(`/api/almoxarifado/ferramentas/${fid}`).send(corpo);
const nCal = async (db, fid) => (await dbGet(db, 'SELECT COUNT(*) n FROM calibracoes_ferramenta_almoxarifado WHERE ferramenta_id = ?', [fid])).n;
const nAud = async (db, fid, acao) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
  WHERE entidade = 'ferramenta' AND entidade_id = ? AND acao = ?`, [fid, acao])).n;
const ferr = (db, fid) => dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ?', [fid]);

/**
 * Gancho da RN-187.04 no `db.get` da INSTANCIA: no primeiro disparo da leitura inicial
 * (`FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1`) le a linha velha, grava BAIXADA pelo `db.run` original e
 * devolve a velha. Com `restaurarNaGravacao`, a gravacao seguinte (UPDATE da ferramenta ou INSERT da calibracao) roda e,
 * terminada, grava DISPONIVEL de volta antes de devolver o resultado (I1: a releitura acha a ferramenta fora de BAIXADA).
 * O contador conta DISPAROS, nao casamentos do regex (M7).
 */
function armarGancho(db, fid, { restaurarNaGravacao = false } = {}) {
  const origGet = db.get; const origRun = db.run;
  const g = { disparos: 0, statusDevolvido: null, restauros: 0, changesDaGravacao: null };
  db.get = function (sql, params, cb) {
    if (g.disparos === 0 && /FROM ferramentas_almoxarifado WHERE id = \? AND ativo = 1/.test(sql)) {
      g.disparos += 1;
      return origGet.call(db, sql, params, (err, row) => {
        g.statusDevolvido = row && row.status;
        origRun.call(db, "UPDATE ferramentas_almoxarifado SET status = 'BAIXADA' WHERE id = ?", [fid], () => cb(err, row));
      });
    }
    return origGet.apply(db, arguments);
  };
  if (restaurarNaGravacao) {
    db.run = function (sql, params, cb) {
      if (g.disparos === 1 && g.restauros === 0
        && /^\s*(UPDATE ferramentas_almoxarifado SET|INSERT INTO calibracoes_ferramenta_almoxarifado)/.test(sql)) {
        return origRun.call(db, sql, params, function (err) {
          const ctx = this;
          g.restauros += 1; g.changesDaGravacao = ctx.changes;
          origRun.call(db, "UPDATE ferramentas_almoxarifado SET status = 'DISPONIVEL' WHERE id = ?", [fid], () => cb.call(ctx, err));
        });
      }
      return origRun.apply(db, arguments);
    };
  }
  g.desarmar = () => { db.get = origGet; db.run = origRun; };
  return g;
}

(async () => {
  // ── RN-187.01 — calibrar a baixada ─────────────────────────────────────────────────────────
  await test('[RN-187.01] calibrar baixada com certificado -> 400 literal, nada gravado, certificado apagado', async () => {
    const { app, db, close, uploadsAlmoxDir } = await createTestApp();
    const fid = await baixadaPelaRota(app, db);
    const antes = fs.readdirSync(uploadsAlmoxDir).length;
    const r = await calibrar(app, fid);
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FRASE_CAL);
    assert.strictEqual(await nCal(db, fid), 0);
    assert.strictEqual(await nAud(db, fid, 'CALIBRACAO'), 0);
    assert.strictEqual(fs.readdirSync(uploadsAlmoxDir).length, antes, 'certificado ficou orfao no disco');
    await close();
  });

  await test('[RN-187.01] ordem: baixada + validade invalida -> a frase da baixada, nao a da data', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await baixadaPelaRota(app, db);
    const r = await calibrar(app, fid, '2026-05-01', '2026-05-01');
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FRASE_CAL);
    await close();
  });

  // ── RN-187.02 — editar a baixada ───────────────────────────────────────────────────────────
  await test('[RN-187.02] editar baixada { nome } -> 400 literal, nome continua, sem EDICAO', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await baixadaPelaRota(app, db);
    const r = await editar(app, fid, { nome: 'Novo' });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FRASE_EDI);
    assert.strictEqual((await ferr(db, fid)).nome, 'Torquímetro 187');
    assert.strictEqual(await nAud(db, fid, 'EDICAO'), 0);
    await close();
  });

  await test('[RN-187.02] corpo vazio -> 400 literal (era 200)', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await baixadaPelaRota(app, db);
    const r = await editar(app, fid, {});
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FRASE_EDI);
    await close();
  });

  await test('[RN-187.02] patrimonio de outra ferramenta -> 400 da baixada (era 409)', async () => {
    const { app, db, close } = await createTestApp();
    await novaFerramenta(db, { codigo: 'PAT-OUTRA', nome: 'Outra' });
    const fid = await baixadaPelaRota(app, db);
    const r = await editar(app, fid, { codigo_patrimonio: 'PAT-OUTRA' });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FRASE_EDI);
    assert.notStrictEqual((await ferr(db, fid)).codigo_patrimonio, 'PAT-OUTRA');
    await close();
  });

  // ── RN-187.03 — os outros status nao mudam ─────────────────────────────────────────────────
  for (const status of ['DISPONIVEL', 'EMPRESTADA', 'EM_MANUTENCAO', 'AVARIADA', 'PERDIDA', 'BLOQUEADA']) {
    await test(`[RN-187.03] ${status} calibra 201 e edita 200`, async () => {
      const { app, db, close } = await createTestApp();
      const fid = await novaFerramenta(db, { status });
      const c = await calibrar(app, fid);
      assert.strictEqual(c.status, 201, `calibrar ${status}: ${c.status} ${JSON.stringify(c.body)}`);
      assert.strictEqual(await nCal(db, fid), 1);
      const e = await editar(app, fid, { nome: `Novo ${status}` });
      assert.strictEqual(e.status, 200, `editar ${status}: ${e.status} ${JSON.stringify(e.body)}`);
      assert.deepStrictEqual(e.body, { id: fid });
      assert.strictEqual((await ferr(db, fid)).nome, `Novo ${status}`);
      await close();
    });
  }

  await test('[RN-187.03] baixada -> Reverter baixa -> calibra 201 e edita 200', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await baixadaPelaRota(app, db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/reverter-baixa`).send({ justificativa: 'baixa errada' }).expect(200);
    const c = await calibrar(app, fid);
    assert.strictEqual(c.status, 201, `${c.status} ${JSON.stringify(c.body)}`);
    const e = await editar(app, fid, { nome: 'Depois de reverter' });
    assert.strictEqual(e.status, 200, `${e.status} ${JSON.stringify(e.body)}`);
    assert.strictEqual((await ferr(db, fid)).nome, 'Depois de reverter');
    await close();
  });

  await test('[RN-187.03] inexistente -> 404 nas duas', async () => {
    const { app, close } = await createTestApp();
    const c = await calibrar(app, 999999);
    assert.strictEqual(c.status, 404); assert.strictEqual(c.body.error, 'Ferramenta não encontrada');
    const e = await editar(app, 999999, { nome: 'x' });
    assert.strictEqual(e.status, 404); assert.strictEqual(e.body.error, 'Ferramenta não encontrada');
    await close();
  });

  await test('[RN-187.03] PRODUCAO -> 403 nas duas (metade positiva: o mesmo PUT do ALMOXARIFE da 200)', async () => {
    const { app, db, close, setUser } = await createTestApp();
    const fid = await novaFerramenta(db);
    setUser(PRODUCAO);
    const c = await calibrar(app, fid);
    assert.strictEqual(c.status, 403, `calibrar PRODUCAO: ${c.status}`);
    const e = await editar(app, fid, { nome: 'Pela producao' });
    assert.strictEqual(e.status, 403, `editar PRODUCAO: ${e.status}`);
    assert.strictEqual((await ferr(db, fid)).nome, 'Torquímetro 187');
    setUser(ALMOXARIFE);
    await editar(app, fid, { nome: 'Pelo almox' }).expect(200);
    assert.strictEqual((await ferr(db, fid)).nome, 'Pelo almox');
    await close();
  });

  // ── RN-187.04 — a guarda esta na gravacao (pelo servico, com gancho) ───────────────────────
  await test('[RN-187.04] corrida edicao: baixada entre a leitura e a gravacao -> 400 literal, nada gravado', async () => {
    const { db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const g = armarGancho(db, fid);
    let erro = null;
    try { await toolService.atualizarFerramenta(db, ALMOXARIFE, fid, { nome: 'Novo' }); } catch (e) { erro = e; }
    g.desarmar();
    assert.strictEqual(g.disparos, 1, 'premissa: o gancho nao disparou');
    assert.strictEqual(g.statusDevolvido, 'DISPONIVEL', 'premissa: a linha devolvida nao era a velha');
    assert.ok(erro, 'esperava rejeicao; a edicao gravou');
    assert.strictEqual(erro.status, 400); assert.strictEqual(erro.message, FRASE_EDI);
    assert.strictEqual((await ferr(db, fid)).nome, 'Torquímetro 187');
    assert.strictEqual(await nAud(db, fid, 'EDICAO'), 0);
    await close();
  });

  await test('[RN-187.04] corrida calibracao: baixada entre a leitura e a gravacao -> 400 literal, nada gravado', async () => {
    const { db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    const g = armarGancho(db, fid);
    let erro = null;
    try {
      await toolService.registrarCalibracao(db, ALMOXARIFE, fid, { data_calibracao: '2026-01-01', data_validade: '2030-01-01' }, null);
    } catch (e) { erro = e; }
    g.desarmar();
    assert.strictEqual(g.disparos, 1, 'premissa: o gancho nao disparou');
    assert.strictEqual(g.statusDevolvido, 'DISPONIVEL', 'premissa: a linha devolvida nao era a velha');
    assert.ok(erro, 'esperava rejeicao; a calibracao gravou');
    assert.strictEqual(erro.status, 400); assert.strictEqual(erro.message, FRASE_CAL);
    assert.strictEqual(await nCal(db, fid), 0);
    assert.strictEqual(await nAud(db, fid, 'CALIBRACAO'), 0);
    await close();
  });

  // I1: a gravacao recusou (changes 0) e a ferramenta ja voltou a DISPONIVEL antes da releitura — nunca 201 com id alheio
  await test('[RN-187.04b] gravacao que nao grava e releitura fora de BAIXADA -> 400 da baixada, nada na trilha', async () => {
    const { db, close } = await createTestApp();
    const fid = await novaFerramenta(db);

    let g = armarGancho(db, fid, { restaurarNaGravacao: true });
    let erro = null;
    try {
      await toolService.registrarCalibracao(db, ALMOXARIFE, fid, { data_calibracao: '2026-01-01', data_validade: '2030-01-01' }, null);
    } catch (e) { erro = e; }
    g.desarmar();
    assert.strictEqual(g.disparos, 1, 'premissa: a leitura inicial nao disparou');
    assert.strictEqual(g.restauros, 1, 'premissa: a gravacao nao disparou o restauro');
    assert.ok(erro, 'calibracao: esperava rejeicao, respondeu sucesso');
    assert.strictEqual(erro.status, 400); assert.strictEqual(erro.message, FRASE_CAL);
    assert.strictEqual(await nCal(db, fid), 0);
    assert.strictEqual(await nAud(db, fid, 'CALIBRACAO'), 0);

    g = armarGancho(db, fid, { restaurarNaGravacao: true });
    erro = null;
    try { await toolService.atualizarFerramenta(db, ALMOXARIFE, fid, { nome: 'Novo' }); } catch (e) { erro = e; }
    g.desarmar();
    assert.strictEqual(g.disparos, 1, 'premissa: a leitura inicial nao disparou (edicao)');
    assert.strictEqual(g.restauros, 1, 'premissa: a gravacao nao disparou o restauro (edicao)');
    assert.ok(erro, 'edicao: esperava rejeicao, respondeu sucesso');
    assert.strictEqual(erro.status, 400); assert.strictEqual(erro.message, FRASE_EDI);
    assert.strictEqual((await ferr(db, fid)).nome, 'Torquímetro 187');
    assert.strictEqual(await nAud(db, fid, 'EDICAO'), 0);
    await close();
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})();
