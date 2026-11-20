/**
 * Etapa 252 (item 23, C493, revoga a B1404 na parte do irmao) — a parte AUTOMATICA da entrega de item com serie em material SEM lote
 * respeita a guarda sem lote: quando a baixa de sempre (uma SAIDA sem endereco, o claim pela maior linha) levaria guarda que conta, a baixa
 * sai por ENDERECO DA SERIE (uma SAIDA por endereco, origem estrita, com as series dele).
 *
 * RN-252.20: guarda que conta + o claim de sempre a levaria -> SAIDA por endereco da serie.
 * RN-252.21: o endereco de alguma serie nao cobre (livre = linha sem lote - guarda), esta bloqueado, ou a serie nao tem endereco -> como hoje.
 * RN-252.22: sem guarda que conte, ou o claim de sempre nao a levaria -> como hoje (o [RN-207.02 c] continua valendo).
 * RN-252.23: o C493 -> o item 1 (serie B1) sai de B; o item 2, num clique, sai de A.
 * Retrato = linhas de saldo nao nulas + fisico; "series por endereco" = series EM_ESTOQUE por endereco (tem de bater com as linhas).
 * Plano: docs/superpowers/plans/2026-11-19-almoxarifado-etapa252-endereco-da-troca-frase-do-irmao-e-serie.md
 *
 * Executar: cd server && node tests/api/entregaSerieRespeitaGuarda.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 252S', role: 'admin', is_superadmin: 1, email: 'a252s@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 252 (C493): a peca com serie respeita a separacao do outro item ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor='0'`);
  const alm = await request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM252S', nome: 'Almox 252 S' });
  assert.ok(alm.status === 201 || alm.status === 200, JSON.stringify(alm.body));
  const loc = async (codigo) => {
    const r = await request(app).post(`${API}/localizacoes`).send({ codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('TS-A'); const B = await loc('TS-B'); const P = await loc('TS-P');
  const material = async () => {
    const c = `E252S-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, 0, 1, 0, ?)`, [c, c, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, numeros) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: numeros.length,
      motivo: 'e252', localizacao_destino_id: destino, series: numeros.map((n) => `${m.nome}-${n}`) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const serie = async (m, n) => (await dbGet(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [m.id, `${m.nome}-${n}`])).id;
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E252S-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = async (R, linhas) => {
    const r = await request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: linhas });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const entregar = async (R, linhas, st = 200) => {
    const r = await request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: linhas });
    assert.strictEqual(r.status, st, JSON.stringify(r.body));
    return r;
  };
  const retrato = async (m) => {
    const linhas = await dbAll(db, `SELECT l.codigo as loc, s.quantidade q FROM estoque_saldo_almoxarifado s
        LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? ORDER BY l.codigo`, [m.id]);
    const fis = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return {
      linhas: linhas.filter((x) => Math.abs(Number(x.q)) > 1e-9).map((x) => `${x.loc || '-'}=${Number(x.q)}`),
      fisico: Number(fis.q),
    };
  };
  const seriesPorEndereco = async (m) => (await dbAll(db, `SELECT l.codigo as loc, COUNT(*) n FROM series_almoxarifado s
      LEFT JOIN localizacoes_almoxarifado l ON l.id = s.localizacao_id WHERE s.material_id = ? AND s.status = 'EM_ESTOQUE'
      GROUP BY l.codigo ORDER BY l.codigo`, [m.id])).map((x) => `${x.loc || '-'}=${Number(x.n)}`);
  const livro = async (R, m) => (await dbAll(db, `SELECT l.codigo as loc, mv.quantidade q FROM movimentacoes_almoxarifado mv
      LEFT JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_origem_id
      WHERE mv.requisicao_id = ? AND mv.material_id = ? AND mv.tipo = 'SAIDA' ORDER BY mv.id`, [R, m.id])).map((x) => [x.loc || null, Number(x.q)]);
  const seriesDaSaida = async (R, m) => (await dbAll(db, `SELECT l.codigo as loc, s.numero FROM series_almoxarifado s
      JOIN movimentacoes_almoxarifado mv ON mv.id = s.movimentacao_saida_id LEFT JOIN localizacoes_almoxarifado l ON l.id = mv.localizacao_origem_id
      WHERE mv.requisicao_id = ? AND s.material_id = ? ORDER BY s.numero`, [R, m.id])).map((x) => `${x.numero.replace(`${m.nome}-`, '')}@${x.loc || '-'}`);

  // O C493: A 3 (A1..A3), B 2 (B1, B2); item 2 (3) separado de A, item 1 (1) separado sem origem.
  const cenarioC493 = async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1', 'B2']);
    const { R, ids } = await reqDireta([[m.id, 1], [m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=3', 'TS-B=2'], fisico: 5 }, 'premissa');
    return { m, R, ids };
  };

  await test('[RN-252.23] C493: o item 1 com a serie B1 sai de B (A fica com 3); o item 2 sai de A num clique; series e linhas batem', async () => {
    const { m, R, ids } = await cenarioC493();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serie(m, 'B1')] }]);
    assert.deepStrictEqual(await livro(R, m), [['TS-B', 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=3', 'TS-B=1'], fisico: 4 });
    assert.deepStrictEqual(await seriesPorEndereco(m), ['TS-A=3', 'TS-B=1']);
    await entregar(R, [{ item_id: ids[1], quantidade_atendida: 3,
      serie_ids: [await serie(m, 'A1'), await serie(m, 'A2'), await serie(m, 'A3')] }]);
    assert.deepStrictEqual(await livro(R, m), [['TS-B', 1], ['TS-A', 3]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-B=1'], fisico: 1 });
    assert.deepStrictEqual(await seriesPorEndereco(m), ['TS-B=1']);
  });

  await test('[RN-252.20] duas series em dois enderecos (A1 + B1), A 3 com 2 guardados: uma SAIDA por endereco, cada serie na sua', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1', 'B2']);
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 2, serie_ids: [await serie(m, 'B1'), await serie(m, 'A1')] }]);
    assert.deepStrictEqual((await livro(R, m)).sort(), [['TS-A', 1], ['TS-B', 1]]);
    assert.deepStrictEqual(await seriesDaSaida(R, m), ['A1@TS-A', 'B1@TS-B']);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=2', 'TS-B=1'], fisico: 3 });
    assert.deepStrictEqual(await seriesPorEndereco(m), ['TS-A=2', 'TS-B=1']);
    await entregar(R, [{ item_id: ids[1], quantidade_atendida: 2, serie_ids: [await serie(m, 'A2'), await serie(m, 'A3')] }]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-B=1'], fisico: 1 });
  });

  await test('[RN-252.21 a] a serie esta no endereco guardado e o livre dele nao cobre (A1, A 3 toda guardada) -> como hoje, uma SAIDA sem endereco', async () => {
    const { m, R, ids } = await cenarioC493();
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serie(m, 'A1')] }]);
    assert.deepStrictEqual(await livro(R, m), [[null, 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=2', 'TS-B=2'], fisico: 4 });
  });

  await test('[RN-252.21 b] a serie sem endereco -> como hoje', async () => {
    const { m, R, ids } = await cenarioC493();
    const b1 = await serie(m, 'B1');
    await dbRun(db, 'UPDATE series_almoxarifado SET localizacao_id = NULL WHERE id = ?', [b1]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [b1] }]);
    assert.deepStrictEqual(await livro(R, m), [[null, 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=2', 'TS-B=2'], fisico: 4 });
  });

  await test('[RN-252.21 c] o endereco da serie bloqueado -> como hoje (nenhuma recusa nova)', async () => {
    const { m, R, ids } = await cenarioC493();
    const B2 = await loc(`TS-BB${seq}`);
    await entrar(m, B2.id, ['C1']);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [B2.id]);
    try {
      await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serie(m, 'C1')] }]);
      assert.deepStrictEqual(await livro(R, m), [[null, 1]]);
    } finally {
      await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 0 WHERE id = ?', [B2.id]);
    }
  });

  await test('[RN-252.22 a] sem guarda: A 3, B 2, a serie B1 -> uma SAIDA sem endereco (o claim de sempre tira de A)', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1', 'B2']);
    const { R, ids } = await reqDireta([[m.id, 1]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serie(m, 'B1')] }]);
    assert.deepStrictEqual(await livro(R, m), [[null, 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=2', 'TS-B=2'], fisico: 4 });
  });

  await test('[RN-252.22 b] guarda que o claim de sempre nao leva (A 3 com 2 guardados, a serie B1) -> como hoje', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1', 'B2']);
    const { R, ids } = await reqDireta([[m.id, 1], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serie(m, 'B1')] }]);
    assert.deepStrictEqual(await livro(R, m), [[null, 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=2', 'TS-B=2'], fisico: 4 });
  });

  // Fase 2 (item 1, C76): a transferencia move a linha e deixa a serie — o endereco gravado na serie nao e confiavel. B com mais series do
  // que linha -> como hoje (sem isto a SAIDA iria para B com a peca em A: A 5 e B 1 no livro).
  await test('[RN-252.21 d] depois de transferir 2 de B para A, B tem 4 series e linha 2 -> o endereco da serie nao vale: como hoje', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1', 'B2']);
    const t = await request(app).post(`${API}/transferencias`).send({ material_id: m.id, quantidade: 2, localizacao_origem_id: B.id,
      localizacao_destino_id: A.id, motivo: 't252' });
    assert.ok(t.status === 200 || t.status === 201, JSON.stringify(t.body));
    await entrar(m, B.id, ['B3', 'B4']);
    assert.deepStrictEqual([await retrato(m), await seriesPorEndereco(m)],
      [{ linhas: ['TS-A=5', 'TS-B=2'], fisico: 7 }, ['TS-A=3', 'TS-B=4']], 'premissa: a serie ficou em B');
    const { R, ids } = await reqDireta([[m.id, 1], [m.id, 5]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, serie_ids: [await serie(m, 'B1')] }]);
    assert.deepStrictEqual(await livro(R, m), [[null, 1]]);
  });

  // Fase 2 (item 2): o pedaco com origem (A, estrito) leva as series que estao em A, nao as primeiras da lista.
  await test('[RN-252.24] separado 2 de A + 1 sem origem, series [B1, A1, A2]: a SAIDA de A leva A1 e A2; a automatica, B1', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1', 'B2']);
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 1 }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3,
      serie_ids: [await serie(m, 'B1'), await serie(m, 'A1'), await serie(m, 'A2')] }]);
    assert.deepStrictEqual(await seriesDaSaida(R, m), ['A1@TS-A', 'A2@TS-A', 'B1@-']);
  });

  // Fase 5 (achado 2): series intercaladas — cada SAIDA leva as series do SEU endereco (sem o reagrupamento, a de B levava A1).
  await test('[RN-252.20 b] series intercaladas [B1, A1, B2], A 4 com 3 guardados: a SAIDA de B leva B1 e B2; a de A, A1', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3', 'A4']); await entrar(m, B.id, ['B1', 'B2', 'B3']);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 3]]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await entregar(R, [{ item_id: ids[0], quantidade_atendida: 3,
      serie_ids: [await serie(m, 'B1'), await serie(m, 'A1'), await serie(m, 'B2')] }]);
    assert.deepStrictEqual(await seriesDaSaida(R, m), ['A1@TS-A', 'B1@TS-B', 'B2@TS-B']);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=3', 'TS-B=1'], fisico: 4 });
  });

  // Fase 5 (achado 3): com reserva parcial + excedente, os dois pedacos automaticos (com e sem reserva) saem pelo endereco da serie.
  await test('[RN-252.20 c] reserva de 1 + excedente de 1, series B1 e B2, A guardado por outra requisicao: as duas saem de B; a outra sai de A', async () => {
    const m = await material();
    await entrar(m, A.id, ['A1', 'A2', 'A3']); await entrar(m, B.id, ['B1']);
    const aprovada = async (q) => {
      const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
        VALUES (?, 2, 'Sol', 'PENDENTE')`, [`REQ-E252S-${++seq}`])).lastID;
      const i = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q])).lastID;
      const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
      assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
      return { R, i };
    };
    const r2 = await aprovada(3);
    await separar(r2.R, [{ item_id: r2.i, quantidade_separada: 3, localizacao_origem_id: A.id }]);
    const r1 = await aprovada(2);
    const res = await dbAll(db, 'SELECT quantidade q FROM reservas_material_almoxarifado WHERE requisicao_id = ?', [r1.R]);
    assert.deepStrictEqual(res.map((x) => Number(x.q)), [1], 'premissa: reserva parcial de 1');
    await entrar(m, B.id, ['B2']);
    await separar(r1.R, [{ item_id: r1.i, quantidade_separada: 2 }]);
    await entregar(r1.R, [{ item_id: r1.i, quantidade_atendida: 2, serie_ids: [await serie(m, 'B1'), await serie(m, 'B2')] }]);
    assert.deepStrictEqual(await livro(r1.R, m), [['TS-B', 1], ['TS-B', 1]]);
    assert.deepStrictEqual(await retrato(m), { linhas: ['TS-A=3'], fisico: 3 });
    await entregar(r2.R, [{ item_id: r2.i, quantidade_atendida: 3,
      serie_ids: [await serie(m, 'A1'), await serie(m, 'A2'), await serie(m, 'A3')] }]);
    assert.deepStrictEqual(await retrato(m), { linhas: [], fisico: 0 });
  });

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
