/**
 * Etapa 53 — a sugestão de localização para ENTRADA.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa53-sugestao-localizacao.md
 *
 * A invariante que vale é "toda sugestão é aceita pelo motor" — mas ela é FRACA sozinha (Fase 2): o
 * motor aceita localização inativa, inexistente e pai, e a invariante passaria com qualquer uma delas
 * e também com a lista vazia. Por isso os cenários negativos são explícitos, e a invariante roda sobre
 * uma lista que tem de NÃO estar vazia.
 *
 * Executar: cd server && node tests/api/sugestaoLocalizacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 53: sugestao de localizacao na entrada ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const almox = async (ativo = 1) => (await dbRun(db, 'INSERT INTO almoxarifados (codigo, nome, ativo) VALUES (?,?,?)',
    [`E53-ALM${++seq}`, 'Alm', ativo])).lastID;
  const ALM = await almox();
  const loc = async (codigo, extra = {}) => (await dbRun(db, `INSERT INTO localizacoes_almoxarifado
      (codigo, descricao, ativo, bloqueada, parent_id, almoxarifado_id, tipos_material_permitidos) VALUES (?,?,?,?,?,?,?)`,
  [`E53-${codigo}-${++seq}`, codigo, extra.ativo ?? 1, extra.bloqueada || 0, extra.parent || null,
    extra.almox !== undefined ? extra.almox : ALM, extra.tipos ? JSON.stringify(extra.tipos) : null])).lastID;
  const material = async (extra = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id) VALUES (?, 'Mat', 'UN', 0, ?, ?, ?)`,
  [`E53-M${++seq}`, extra.ativo ?? 1, extra.tipo || 'CONSUMIVEL', extra.padrao || null])).lastID;
  const entrada = async (m, destino, q = 1) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({
    material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e53', ...(destino ? { localizacao_destino_id: destino } : {}),
  });
  const sugestao = async (m) => {
    const r = await request(app).get(`/api/almoxarifado/materiais/${m}/sugestao-localizacao`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const ids = (s) => s.sugestoes.map((x) => x.localizacao_id);

  // Um cenário rico, compartilhado: padrão, dois endereços com saldo, vazias compatíveis e
  // várias que NÃO podem aparecer.
  const P = await loc('PADRAO'); const A = await loc('A'); const B = await loc('B');
  const V1 = await loc('V1'); const V2 = await loc('V2');
  const BLOQ = await loc('BLOQ', { bloqueada: 1 });
  const TIPO = await loc('SO-EPI', { tipos: ['EPI'] });
  const INAT = await loc('INAT', { ativo: 0 });
  const PAI = await loc('PAI'); await loc('FILHA-VAZIA', { parent: PAI });
  const ALMI = await almox(0); const NOALMINAT = await loc('ALMINAT', { almox: ALMI });
  const m = await material({ padrao: P });
  // INAT com o MAIOR saldo: o motor aceita entrada em localizacao inativa (defeito anotado na letra C),
  // entao so o filtro de "ativa" nas posicoes com saldo a mantem fora - sem isto, o (2) passava
  // pela lista de vazias, que ja exclui inativa.
  for (const [d, q] of [[A, 5], [B, 20], [P, 3], [INAT, 50]]) {
    const r = await entrada(m, d, q); assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  }

  await test('(1) ordem: a PADRAO primeiro, depois onde ja tem o material (maior primeiro), depois vazias', async () => {
    const s = await sugestao(m);
    assert.strictEqual(s.padrao.localizacao_id, P); assert.strictEqual(s.padrao.recusa, null);
    assert.deepStrictEqual(s.sugestoes.slice(0, 3).map((x) => [x.localizacao_id, x.motivo]),
      [[P, 'PADRAO'], [B, 'JA_TEM_O_MATERIAL'], [A, 'JA_TEM_O_MATERIAL']]);
    const vazias = s.sugestoes.filter((x) => x.motivo === 'VAZIA_COMPATIVEL').map((x) => x.localizacao_id);
    assert.ok(vazias.includes(V1) && vazias.includes(V2), JSON.stringify(s.sugestoes));
    assert.ok(vazias.length <= 5);
  });

  await test('(2) NUNCA aparecem: bloqueada, que nao aceita o tipo, inativa, pai (conteiner), de almoxarifado inativo', async () => {
    const s = ids(await sugestao(m));
    for (const [nome, id] of [['bloqueada', BLOQ], ['tipo', TIPO], ['inativa', INAT], ['pai', PAI], ['almox inativo', NOALMINAT]]) {
      assert.ok(!s.includes(id), `sugeriu a ${nome}`);
    }
  });

  await test('(3) sem repeticao: a padrao com saldo aparece uma vez, como PADRAO', async () => {
    const s = ids(await sugestao(m));
    assert.strictEqual(s.length, new Set(s).size);
    assert.strictEqual(s.filter((x) => x === P).length, 1);
  });

  await test('(4) INVARIANTE: toda sugestao (lista NAO vazia) e aceita pelo motor numa entrada real', async () => {
    const s = (await sugestao(m)).sugestoes;
    assert.ok(s.length >= 4, `lista curta demais para provar algo: ${s.length}`);
    for (const x of s) {
      const r = await entrada(m, x.localizacao_id);
      assert.strictEqual(r.status, 201, `o motor recusou a sugestao ${x.codigo}: ${JSON.stringify(r.body)}`);
    }
  });

  await test('(5) padrao BLOQUEADA: vem em padrao.recusa com a literal do motor, e nao entra nas sugestoes', async () => {
    const PB = await loc('PB', { bloqueada: 1 }); const m2 = await material({ padrao: PB });
    const s = await sugestao(m2);
    assert.ok(/^Localização E53-PB-\d+ está bloqueada$/.test(s.padrao.recusa), s.padrao.recusa);
    assert.ok(!ids(s).includes(PB));
    // E é isso mesmo que o motor diz na entrada SEM destino.
    const r = await entrada(m2, null);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, s.padrao.recusa);
  });

  await test('(6) padrao que NAO ACEITA O TIPO: recusa com a literal do motor', async () => {
    const PT = await loc('PT', { tipos: ['EPI'] }); const m3 = await material({ padrao: PT, tipo: 'CONSUMIVEL' });
    const s = await sugestao(m3);
    assert.ok(/não aceita o tipo de material 'CONSUMIVEL'$/.test(s.padrao.recusa), s.padrao.recusa);
    assert.strictEqual((await entrada(m3, null)).body.error, s.padrao.recusa);
  });

  await test('(7) sem padrao: padrao null, e as vazias compativeis aparecem', async () => {
    const s = await sugestao(await material());
    assert.strictEqual(s.padrao, null);
    assert.ok(s.sugestoes.length > 0 && s.sugestoes.every((x) => x.motivo === 'VAZIA_COMPATIVEL'));
  });

  await test('(8) 404 e material inativo com as literais', async () => {
    const r = await request(app).get('/api/almoxarifado/materiais/999999/sugestao-localizacao');
    assert.strictEqual(r.status, 404); assert.strictEqual(r.body.error, 'Material não encontrado');
    const mi = await material({ ativo: 0 });
    const i = await request(app).get(`/api/almoxarifado/materiais/${mi}/sugestao-localizacao`);
    assert.strictEqual(i.status, 400); assert.strictEqual(i.body.error, 'Material inativo não pode ser movimentado');
  });

  // Fase 5 (revisão adversarial): lacunas que passavam verdes com o serviço quebrado.
  await test('(9) quantidade_no_endereco vem certa — a tela mostra esse numero', async () => {
    // Setup B=20, A=5, P=3, mais a entrada de 1 que o (4) fez em cada sugestao.
    const s = await sugestao(m);
    const q = Object.fromEntries(s.sugestoes.map((x) => [x.localizacao_id, x.quantidade_no_endereco]));
    assert.strictEqual(q[B], 21); assert.strictEqual(q[A], 6); assert.strictEqual(q[P], 4);
  });

  await test('(10) padrao INATIVA: padrao.inativa=true (a tela avisa), recusa null, e nao entra nas sugestoes', async () => {
    const PI = await loc('PI', { ativo: 0 }); const mi = await material({ padrao: PI });
    const s = await sugestao(mi);
    assert.strictEqual(s.padrao.localizacao_id, PI); assert.strictEqual(s.padrao.inativa, true);
    assert.strictEqual(s.padrao.recusa, null);
    assert.ok(!ids(s).includes(PI)); assert.ok(s.sugestoes.length > 0);
    // Metade positiva: a padrão ativa NÃO vem marcada.
    assert.strictEqual((await sugestao(m)).padrao.inativa, false);
  });

  await test('(11) padrao em ALMOXARIFADO inativo: padrao.inativa=true e fora das sugestoes', async () => {
    const PA = await loc('PA', { almox: ALMI }); const ma = await material({ padrao: PA });
    const s = await sugestao(ma);
    assert.strictEqual(s.padrao.inativa, true); assert.ok(!ids(s).includes(PA));
  });

  await test('(12) vazias: as do almoxarifado da padrao vem ANTES das de outro almoxarifado', async () => {
    const ALM2 = await almox(); const OUTRA = await loc('AAA-OUTRA', { almox: ALM2 }); // alfabeticamente a 1a: sem a ordenacao, viria antes
    const ALM3 = await almox(); const PP = await loc('PP', { almox: ALM3 }); const MESMA = await loc('MESMA', { almox: ALM3 });
    const mp = await material({ padrao: PP });
    const vaz = (await sugestao(mp)).sugestoes.filter((x) => x.motivo === 'VAZIA_COMPATIVEL').map((x) => x.localizacao_id);
    assert.strictEqual(vaz[0], MESMA, JSON.stringify(vaz));
    assert.ok(vaz.includes(OUTRA) && vaz.indexOf(OUTRA) > vaz.indexOf(MESMA), JSON.stringify(vaz));
  });

  await test('(13) PAI com saldo do material nao e sugerido (nem como padrao, nem como ja-tem)', async () => {
    const PAI2 = await loc('PAI2'); const mp = await material({ padrao: PAI2 });
    const r = await entrada(mp, PAI2, 7); assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await loc('FILHA2', { parent: PAI2 });
    const s = await sugestao(mp);
    assert.ok(!ids(s).includes(PAI2), JSON.stringify(s.sugestoes));
    assert.ok(s.sugestoes.length > 0);
  });

  await test('(14) endereco com saldo NEGATIVO do material nao e rotulado vazio', async () => {
    // '0' ordena antes de tudo: sem o filtro, seria a 1a vazia.
    const NEG = await loc('0-NEG'); const mn = await material();
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,?)`, [mn, NEG, -4]);
    const s = await sugestao(mn);
    assert.ok(!ids(s).includes(NEG), JSON.stringify(s.sugestoes));
    assert.ok(s.sugestoes.length > 0);
  });

  await test('(15) sem padrao: vazia SEM almoxarifado nao pula para o topo (null === null)', async () => {
    const SEM = await loc('ZZZ-SEMALM', { almox: null });
    const vaz = (await sugestao(await material())).sugestoes.map((x) => x.localizacao_id);
    assert.ok(vaz.length > 0);
    assert.notStrictEqual(vaz[0], SEM, JSON.stringify(vaz));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
