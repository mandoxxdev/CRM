/**
 * Etapa 181 (RN-181.01..04, emendas C1, C2, I1, I2, I3 da revisao da Fase 2) — o relatorio "EPI por colaborador" le as ENTREGAS
 * de EPI (`entregas_epi_almoxarifado`, Etapa 178), nao mais os emprestimos de ferramenta `tipo='EPI'`; e os dois relatorios de
 * pessoa (`epi-colaborador`, `ferramentas-emprestadas`) deixam de ser de qualquer usuario do modulo.
 *
 * Semeadura: uma entrega pela rota (grava a evidencia na mesma transacao -> "Sim") e duas por INSERT direto, com `criado_em`
 * controlado e SEM evidencia (a anomalia que a coluna "Assinatura" tem de acusar -> "Não"; o INSERT nao passa por trigger
 * nenhum — os triggers da 178 barram UPDATE/DELETE). Uma delas as 22h30 de 21/10 em Brasilia (ISO UTC 01:30 de 22/10): o dia
 * do relatorio e o de Brasilia na consulta, na planilha e no filtro (C1).
 *
 * Executar: cd server && node tests/api/relatorioEpiPorColaborador.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');
const diaLocal = require('../../services/diaLocal');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
  }
}

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}
const getBinary = (req) => req.buffer().parse(binaryParser);
const planilha = (buf) => {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
};

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };

const COLUNAS = [
  ['criado_em', 'Entregue em'], ['numero', 'Número'], ['colaborador_nome', 'Colaborador'], ['matricula', 'Matrícula'],
  ['setor', 'Setor'], ['material_codigo', 'Código'], ['material_nome', 'EPI'], ['ca_numero', 'CA'], ['ca_validade', 'Validade do CA'],
  ['quantidade', 'Quantidade'], ['tamanho', 'Tamanho'], ['motivo', 'Motivo'], ['entregue_por_nome', 'Entregue por'],
  ['tem_evidencia', 'Assinatura'],
];
const URL = '/api/almoxarifado/relatorios/epi-colaborador';

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser } = t;
  wrapDatabase(db);

  const m1 = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-R-1', 'Luva', 'EPIs', 0, 1, 'CA-10', '2099-01-01')`)).lastID;
  const m2 = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-R-2', 'Bota', 'EPIs', 0, 1, 'CA-20', '2099-01-01')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: m1, tipo: 'ENTRADA', quantidade: 5, justificativa: 'carga' });
  const cA = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('ANA', 'A-1', '11122233344', 'ativo', 'Caldeiraria')")).lastID;
  const cB = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('BRUNO', 'B-1', '55566677788', 'ativo', 'Solda')")).lastID;

  const ent = await request(app).post('/api/almoxarifado/epi/entregas')
    .field('colaborador_id', String(cA)).field('material_id', String(m1)).field('quantidade', '1')
    .field('confirmacao_matricula', 'A-1').field('motivo', 'TROCA').field('tamanho', 'G')
    .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));
  const NUM_API = ent.body.numero;
  assert.ok(NUM_API, JSON.stringify(ent.body));

  const semear = (numero, criadoEm, materialId, codigo, nome, ca, motivo, tamanho, movId) => dbRun(db, `INSERT INTO entregas_epi_almoxarifado
    (numero, colaborador_id, colaborador_nome, matricula, setor, material_id, material_codigo, material_nome, ca_numero, ca_validade,
     quantidade, tamanho, motivo, movimentacao_id, entregue_por, entregue_por_nome, criado_em)
    VALUES (?, ?, 'BRUNO', 'B-1', 'Solda', ?, ?, ?, ?, '2099-01-01', 2, ?, ?, ?, 1, 'Admin Teste', ?)`,
  [numero, cB, materialId, codigo, nome, ca, tamanho, motivo, movId, criadoEm]);
  await semear('EPI-SEM-2', '2026-10-22T01:30:00.000Z', m2, 'EPI-R-2', 'Bota', 'CA-20', 'PRIMEIRA_ENTREGA', '42', 900001);
  await semear('EPI-SEM-3', '2026-10-20T15:00:00.000Z', m1, 'EPI-R-1', 'Luva', 'CA-10', 'DANO', null, 900002);

  // O legado: emprestimo em aberto de ferramenta cadastrada como EPI — era a fonte deste relatorio ate a 181.
  const fEpi = (await dbRun(db, "INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, tipo, status) VALUES ('PAT-EPI-1', 'Cinto paraquedista', 'EPI', 'EMPRESTADA')")).lastID;
  await dbRun(db, "INSERT INTO emprestimos_ferramenta_almoxarifado (ferramenta_id, colaborador_nome, setor, status) VALUES (?, 'LEGADO EPI', 'Montagem', 'EMPRESTADA')", [fEpi]);

  const consultar = async (qs = '') => {
    const r = await request(app).get(`${URL}${qs}`);
    assert.strictEqual(r.status, 200, `${qs}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(Array.isArray(r.body), JSON.stringify(r.body));
    return r.body;
  };
  const numeros = (linhas) => linhas.map((l) => l.numero);

  await test('[RN-01/I2/I3] registro: colunas na ordem, params com tipo concreto e exemplo, acao dos dois relatorios', async () => {
    const e = RELATORIOS['epi-colaborador'];
    assert.deepStrictEqual(e.colunas.map((c) => [c.chave, c.rotulo]), COLUNAS);
    assert.deepStrictEqual(e.params.map((p) => [p.nome, p.tipo]),
      [['colaborador_id', 'select'], ['material_id', 'number'], ['de', 'date'], ['ate', 'date']]);
    assert.strictEqual(e.params[0].opcoes_url, '/almoxarifado/aux/colaboradores');
    for (const p of e.params) assert.ok(p.exemplo !== undefined, `${p.nome} sem exemplo`);
    assert.strictEqual(e.acao, 'entregar_epi');
    assert.strictEqual(RELATORIOS['ferramentas-emprestadas'].acao, 'gerenciar_ferramentas');
    assert.strictEqual(e.limite, null);
    assert.strictEqual(e.exportavel, true);
  });

  await test('[RN-04] nota: fonte = entregas com assinatura, integridade na tela de EPI, emprestimo de ferramenta EPI fora', async () => {
    setUser(ADMIN);
    const lista = (await request(app).get('/api/almoxarifado/relatorios')).body.relatorios;
    const item = lista.find((r) => r.tipo === 'epi-colaborador');
    assert.ok(item && item.nota, JSON.stringify(item));
    assert.match(item.nota, /entregas de EPI/i);
    assert.match(item.nota, /assinatura/i);
    assert.match(item.nota, /tela de EPI/i);
    assert.match(item.nota, /Ferramentas emprestadas/);
    assert.deepStrictEqual(item.colunas.map((c) => c.chave), COLUNAS.map(([c]) => c));
  });

  await test('[RN-01] sem filtro: as tres entregas, o legado de ferramenta EPI NAO entra; mais recentes primeiro', async () => {
    setUser(ADMIN);
    const linhas = await consultar();
    assert.ok(linhas.length === 3, JSON.stringify(linhas));
    assert.ok(!JSON.stringify(linhas).includes('LEGADO EPI'), 'o emprestimo de ferramenta EPI voltou ao relatorio');
    assert.ok(!JSON.stringify(linhas).includes('Cinto paraquedista'));
    for (const l of linhas) for (const [c] of COLUNAS) assert.ok(c in l, `linha sem ${c}: ${JSON.stringify(l)}`);
    const i2 = numeros(linhas).indexOf('EPI-SEM-2'); const i3 = numeros(linhas).indexOf('EPI-SEM-3');
    assert.ok(i2 >= 0 && i3 > i2, `ordem: ${numeros(linhas)}`);
    // controle do legado: a semeadura vale (ele aparece em Ferramentas emprestadas)
    const f = await request(app).get('/api/almoxarifado/relatorios/ferramentas-emprestadas');
    assert.strictEqual(f.status, 200);
    assert.ok(JSON.stringify(f.body).includes('LEGADO EPI'), JSON.stringify(f.body));
  });

  await test('[C1] criado_em no formato do banco: 22h30 de 21/10 em Brasilia (ISO 01:30Z de 22/10) -> 2026-10-21 na tela', async () => {
    const l = (await consultar()).find((x) => x.numero === 'EPI-SEM-2');
    assert.strictEqual(l.criado_em, '2026-10-22 01:30:00');
    assert.strictEqual(diaLocal.instanteDoBancoNoFuso(l.criado_em), '2026-10-21 22:30:00');
  });

  await test('[C2/menores] Assinatura Sim/Não, motivo com rotulo, tamanho', async () => {
    const linhas = await consultar();
    const por = (n) => linhas.find((x) => x.numero === n);
    assert.strictEqual(por(NUM_API).tem_evidencia, 'Sim');
    assert.strictEqual(por('EPI-SEM-2').tem_evidencia, 'Não');
    assert.strictEqual(por(NUM_API).motivo, 'Troca');
    assert.strictEqual(por('EPI-SEM-2').motivo, 'Primeira entrega');
    assert.strictEqual(por('EPI-SEM-3').motivo, 'Dano');
    assert.strictEqual(por(NUM_API).tamanho, 'G');
    assert.strictEqual(por('EPI-SEM-2').tamanho, '42');
    assert.strictEqual(por(NUM_API).setor, 'Caldeiraria');
    assert.strictEqual(por(NUM_API).entregue_por_nome, 'Admin Teste');
  });

  await test('[RN-02] colaborador_id filtra (e muda o resultado)', async () => {
    assert.deepStrictEqual(numeros(await consultar(`?colaborador_id=${cA}`)), [NUM_API]);
    assert.deepStrictEqual(numeros(await consultar(`?colaborador_id=${cB}`)), ['EPI-SEM-2', 'EPI-SEM-3']);
  });

  await test('[RN-02] material_id filtra (e muda o resultado)', async () => {
    assert.deepStrictEqual(numeros(await consultar(`?material_id=${m2}`)), ['EPI-SEM-2']);
    assert.strictEqual((await consultar(`?material_id=${m1}`)).length, 2);
  });

  await test('[RN-02/C1] de/ate no dia de Brasilia: a das 22h30 de 21/10 e de 21/10, nao de 22/10', async () => {
    assert.deepStrictEqual(numeros(await consultar('?colaborador_id=' + cB + '&de=2026-10-21&ate=2026-10-21')), ['EPI-SEM-2']);
    assert.deepStrictEqual(numeros(await consultar('?colaborador_id=' + cB + '&de=2026-10-22&ate=2026-10-22')), []);
    assert.deepStrictEqual(numeros(await consultar('?ate=2026-10-20')), ['EPI-SEM-3']);
    assert.ok(!numeros(await consultar('?de=2026-10-21')).includes('EPI-SEM-3'));
    // dia invalido e ignorado (a mesma regua de listarEntregas)
    assert.strictEqual((await consultar('?de=21/10/2026')).length, 3);
  });

  await test('[C1/RN-01] exportacao: cabecalho na ordem e a linha das 22h30 de 21/10 sai com 21/10', async () => {
    setUser(ADMIN);
    const r = await getBinary(request(app).get(`${URL}/export`));
    assert.strictEqual(r.status, 200, `export ${r.status}`);
    const linhas = planilha(r.body);
    assert.deepStrictEqual(linhas[0], COLUNAS.map(([, rot]) => rot));
    const iNum = linhas[0].indexOf('Número');
    const l2 = linhas.find((l) => l[iNum] === 'EPI-SEM-2');
    assert.ok(l2, JSON.stringify(linhas));
    assert.strictEqual(l2[linhas[0].indexOf('Entregue em')], '2026-10-21 22:30:00');
    assert.strictEqual(l2[linhas[0].indexOf('Assinatura')], 'Não');
    assert.strictEqual(l2[linhas[0].indexOf('Motivo')], 'Primeira entrega');
    assert.ok(!JSON.stringify(linhas).includes('LEGADO EPI'));
  });

  const RELS = ['epi-colaborador', 'ferramentas-emprestadas'];
  await test('[RN-03] PRODUCAO: os dois somem da lista; 403 na consulta e na exportacao, sem dado no corpo', async () => {
    setUser(PRODUCAO);
    const tipos = (await request(app).get('/api/almoxarifado/relatorios')).body.relatorios.map((r) => r.tipo);
    for (const tipo of RELS) {
      assert.ok(!tipos.includes(tipo), `${tipo} na lista de PRODUCAO`);
      for (const suf of ['', '/export']) {
        const r = await request(app).get(`/api/almoxarifado/relatorios/${tipo}${suf}`);
        assert.strictEqual(r.status, 403, `${tipo}${suf}: ${r.status}`);
        assert.ok(!JSON.stringify(r.body).includes('BRUNO') && !JSON.stringify(r.body).includes('LEGADO'), JSON.stringify(r.body));
      }
    }
  });

  await test('[RN-03] ALMOXARIFE: os dois na lista; 200 na consulta e na exportacao', async () => {
    setUser(ALMOXARIFE);
    const tipos = (await request(app).get('/api/almoxarifado/relatorios')).body.relatorios.map((r) => r.tipo);
    for (const tipo of RELS) {
      assert.ok(tipos.includes(tipo), `${tipo} fora da lista do ALMOXARIFE`);
      const c = await request(app).get(`/api/almoxarifado/relatorios/${tipo}`);
      assert.strictEqual(c.status, 200, `${tipo}: ${c.status}`);
      const x = await getBinary(request(app).get(`/api/almoxarifado/relatorios/${tipo}/export`));
      assert.strictEqual(x.status, 200, `${tipo}/export: ${x.status}`);
    }
    setUser(ADMIN);
  });

  console.log(`\nrelatorioEpiPorColaborador: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
