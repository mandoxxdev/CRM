/**
 * Etapa 66, Task 3 (galho) — relatorio "Historico de movimentacoes" por motivo do cadastro.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa66-motivos-de-movimentacao.md (T3 e a
 * secao "Fase 2 — revisao do plano": o parametro `motivo_id` e um SELECT na tela, com opcoes vindas
 * de GET /motivos-movimentacao?todos=1 — desativados inclusos, o historico os tem).
 *
 * Prova: (1) o registro declara o filtro `motivo_id` como select com fonte e as colunas Motivo e
 * Justificativa, e a lista as serve; (2) o filtro traz a linha do cadastro e NAO a de texto livre
 * com o mesmo texto (filtra pelo id, nunca pelo nome); (3) motivo DESATIVADO continua filtravel;
 * (4) `motivo_id` mal formado -> 400 com o literal do padrao de parametro dos relatorios
 * (`janela_dias` dos indicadores); (5) o export XLSX traz os cabecalhos e a mesma linha filtrada.
 *
 * Executar: cd server && node tests/api/relatorioMotivoMovimentacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 663, nome: 'Admin E66T3', role: 'admin', is_superadmin: 1, email: 'e66t3@test.com' };
const FORMATO = 'Parâmetro "motivo_id" deve ser um número inteiro positivo';
const URL_REL = '/api/almoxarifado/relatorios/historico-movimentacoes';

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

let seq = 0;
const uniq = (p) => `${p} ${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 66 Task 3: relatorio de historico por motivo ===\n');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  const loc = (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', ['E66T3-L', 'E66T3-L'])).lastID;
  const matId = (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id) VALUES (?, 'Mat E66T3', 'UN', 0, 1, 'ACO', ?)`,
  ['E66T3-M', loc])).lastID;
  const v2 = (body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send(body);
  const ok = async (body) => { const r = await v2(body); assert.strictEqual(r.status, 201, JSON.stringify(r.body)); return r.body; };

  await ok({ material_id: matId, tipo: 'ENTRADA', quantidade: 50, localizacao_destino_id: loc, motivo: 'setup' });
  const criar = await request(app).post('/api/almoxarifado/motivos-movimentacao').send({ nome: uniq('Avaria no manuseio'), tipos: ['PERDA'] });
  assert.strictEqual(criar.status, 201, JSON.stringify(criar.body));
  const avaria = criar.body;
  // A linha do cadastro (com complemento) e uma linha de TEXTO LIVRE com exatamente o mesmo nome.
  await ok({ material_id: matId, tipo: 'PERDA', quantidade: 2, motivo_id: avaria.id, justificativa: 'caixa amassada' });
  await ok({ material_id: matId, tipo: 'PERDA', quantidade: 1, motivo: avaria.nome, justificativa: avaria.nome });

  await test('(1) registro e lista: filtro motivo_id e select com fonte; colunas Motivo e Justificativa', async () => {
    const entrada = RELATORIOS['historico-movimentacoes'];
    const p = entrada.params.find((x) => x.nome === 'motivo_id');
    assert.ok(p, 'param motivo_id nao declarado no registro');
    assert.strictEqual(p.tipo, 'select');
    assert.strictEqual(p.obrigatorio, false);
    assert.strictEqual(p.opcoes_url, '/almoxarifado/motivos-movimentacao?todos=1');
    const rotulos = Object.fromEntries(entrada.colunas.map((c) => [c.chave, c.rotulo]));
    assert.strictEqual(rotulos.motivo, 'Motivo');
    assert.strictEqual(rotulos.justificativa, 'Justificativa');

    const lista = await request(app).get('/api/almoxarifado/relatorios');
    const item = lista.body.relatorios.find((r) => r.tipo === 'historico-movimentacoes');
    assert.ok(item.params.some((x) => x.nome === 'motivo_id' && x.opcoes_url), JSON.stringify(item.params));
    assert.ok(item.colunas.some((c) => c.rotulo === 'Motivo') && item.colunas.some((c) => c.rotulo === 'Justificativa'));
  });

  await test('(2) filtro motivo_id traz a linha do cadastro e NAO a de texto livre com o mesmo texto', async () => {
    const todas = await request(app).get(`${URL_REL}?material_id=${matId}&tipo=PERDA`);
    assert.strictEqual(todas.status, 200, JSON.stringify(todas.body));
    assert.strictEqual(todas.body.length, 2, 'sem o filtro as duas PERDAs aparecem');

    const r = await request(app).get(`${URL_REL}?material_id=${matId}&motivo_id=${avaria.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.length, 1, `esperava so a linha do cadastro, vieram ${r.body.length}: ${JSON.stringify(r.body.map((l) => [l.motivo, l.motivo_id]))}`);
    assert.strictEqual(r.body[0].motivo_id, avaria.id);
    assert.strictEqual(r.body[0].motivo, avaria.nome);
    assert.strictEqual(r.body[0].justificativa, `${avaria.nome} — caixa amassada`);
  });

  await test('(3) motivo DESATIVADO continua filtravel (o historico o tem)', async () => {
    const d = await request(app).delete(`/api/almoxarifado/motivos-movimentacao/${avaria.id}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const r = await request(app).get(`${URL_REL}?motivo_id=${avaria.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.length, 1);
  });

  await test('(4) motivo_id mal formado -> 400 com o literal; vazio = sem filtro', async () => {
    for (const mal of ['0', 'abc', '1.5', '-3', '7x']) {
      const r = await request(app).get(`${URL_REL}?motivo_id=${encodeURIComponent(mal)}`);
      assert.strictEqual(r.status, 400, `motivo_id=${mal}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, FORMATO);
    }
    const vazio = await request(app).get(`${URL_REL}?material_id=${matId}&tipo=PERDA&motivo_id=`);
    assert.strictEqual(vazio.status, 200, JSON.stringify(vazio.body));
    assert.strictEqual(vazio.body.length, 2);
  });

  await test('(5) export XLSX: cabecalhos Motivo e Justificativa, e so a linha filtrada', async () => {
    const res = await request(app).get(`${URL_REL}/export?motivo_id=${avaria.id}`).buffer().parse(binaryParser);
    assert.strictEqual(res.status, 200);
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const cab = linhas[0];
    const iM = cab.indexOf('Motivo'); const iJ = cab.indexOf('Justificativa');
    assert.ok(iM >= 0 && iJ >= 0, `cabecalho sem Motivo/Justificativa: ${JSON.stringify(cab)}`);
    assert.strictEqual(linhas.length - 1, 1, `esperava 1 linha de dados, vieram ${linhas.length - 1}`);
    assert.strictEqual(linhas[1][iM], avaria.nome);
    assert.strictEqual(linhas[1][iJ], `${avaria.nome} — caixa amassada`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
