/**
 * Etapa 96 T4 — o legado torto: a consulta (A47) e o script opcional de normalizacao (B483, B484; RN-07).
 *
 * Antes da 96 o motor somava REAL sem arredondar e gravava 0.9999999999999999 / 0.30000000000000004. Com a T1 a escrita
 * nova sai limpa e a folga (B480) faz o legado nao prender gesto nenhum; o que sobra e o numero torto na tela. A A47
 * (`quantidadeLegado.listarTortos`) lista cada valor gravado com residuo (`col <> ROUND(col, 6)`); o script
 * `scripts/normalizar-quantidades-almoxarifado.js` lista por padrao e so grava com `--aplicar`.
 *
 * O torto e montado por ESCRITOR DIRETO em cada uma das 15 colunas de COLUNAS_LEGADO (14 ate a Fase 5, que somou o solicitado do item — R1) (a B483 diz "15": contagem errada, o contrato e a A47 listam 14) — depois da T1 o motor nao produz
 * mais deriva, e um teste que a fabricasse pelo motor ficaria vazio. Controles limpos (1,5; 0,3; NULL) na mesma tabela
 * provam que a consulta nao acha o que nao e torto. O livro (`movimentacoes_almoxarifado`) nao e reescrito (B484).
 *
 * Regra da Fase 2 (I6): o `arredondado` do relatorio vem do ROUND do SQL, o mesmo que o `normalizar` grava — o teste
 * compara o gravado com esse numero, nunca com um arredondamento do mesmo cru feito em JS.
 *
 * A CLI (Fase 2, I7): `VACUUM INTO '<tmp>/database.sqlite'` (o nome que server/index.js monta sobre PERSISTENT_DATA_DIR)
 * e o script rodado por child_process com CRM_DATA_DIR=<tmp>.
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md
 * Executar: cd server && node tests/api/quantidadeLegado.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const L = require('../../services/almoxarifado/quantidadeLegado');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 96 T4', role: 'admin', is_superadmin: 1, email: 'a96t4@t.com' };
const API = '/api/almoxarifado';
const TORTO_1 = 0.9999999999999999; // 0,7 + 0,2 + 0,1
const TORTO_03 = 0.30000000000000004; // 0,1 + 0,2
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'normalizar-quantidades-almoxarifado.js');
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const chave = (r) => `${r.tabela}.${r.coluna}#${r.id}`;
const abrir = (arquivo) => new Promise((ok, falha) => {
  const d = new sqlite3.Database(arquivo, sqlite3.OPEN_READWRITE, (e) => (e ? falha(e) : ok(d)));
});
const fechar = (d) => new Promise((ok, falha) => d.close((e) => (e ? falha(e) : ok())));
const rodarCli = (dir, args = []) => spawnSync(process.execPath, [SCRIPT, ...args], {
  cwd: path.join(__dirname, '..', '..'),
  env: { ...process.env, CRM_DATA_DIR: dir },
  encoding: 'utf8',
  timeout: 60000,
});

(async () => {
  console.log('\n=== Etapa 96 T4: o legado torto se lista e so se normaliza quando o administrador manda ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });

  // ── O torto, uma linha por coluna de COLUNAS_LEGADO, por escritor direto ──
  const material = async (codigo, extra = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico, custo_unitario, categoria)
      VALUES (?, ?, 'PC', ?, 0, 1, 0, 10, ?)`, [codigo, codigo, extra.fisico ?? 0, extra.categoria || null])).lastID;
  const mT = await material('E96T4-TORTO');
  const mL = await material('E96T4-LIMPO');
  const esperado = new Map(); // chave -> { valor, tabela, coluna, id }
  const torto = async (tabela, coluna, id, valor) => {
    await dbRun(db, `UPDATE ${tabela} SET ${coluna} = ? WHERE id = ?`, [valor, id]);
    const lido = await dbGet(db, `SELECT ${coluna} v FROM ${tabela} WHERE id = ?`, [id]);
    assert.strictEqual(lido.v, valor, `premissa: ${tabela}.${coluna} ficou torto`);
    esperado.set(`${tabela}.${coluna}#${id}`, { tabela, coluna, id, valor });
  };
  // material: as cinco colunas (alternando os dois residuos)
  await torto('materiais_almoxarifado', 'quantidade_atual', mT, TORTO_1);
  await torto('materiais_almoxarifado', 'quantidade_reservada', mT, TORTO_03);
  await torto('materiais_almoxarifado', 'quantidade_bloqueada', mT, TORTO_03);
  await torto('materiais_almoxarifado', 'quantidade_em_inspecao', mT, TORTO_03);
  await torto('materiais_almoxarifado', 'quantidade_em_terceiros', mT, TORTO_03);
  await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = 1.5, quantidade_reservada = 0.3,
      quantidade_bloqueada = 0, quantidade_em_inspecao = NULL WHERE id = ?`, [mL]); // controles limpos
  // linha de saldo (endereco)
  const sT = (await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 0)', [mT])).lastID;
  await torto('estoque_saldo_almoxarifado', 'quantidade', sT, TORTO_1);
  await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 1.5)', [mL]);
  // reserva
  const rT = (await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, quantidade, quantidade_utilizada)
      VALUES (?, 1, 0)`, [mT])).lastID;
  await torto('reservas_material_almoxarifado', 'quantidade', rT, TORTO_1);
  await torto('reservas_material_almoxarifado', 'quantidade_utilizada', rT, TORTO_03);
  await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, quantidade, quantidade_utilizada)
      VALUES (?, 1.5, 0.3)`, [mL]);
  // item da requisicao
  const req = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome)
      VALUES ('E96T4-REQ', 1, 'Adm')`)).lastID;
  const iT = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada)
      VALUES (?, ?, 1)`, [req, mT])).lastID;
  await torto('itens_requisicao_almoxarifado', 'quantidade_solicitada', iT, TORTO_1); // Etapa 96 Fase 5 (R1)
  await torto('itens_requisicao_almoxarifado', 'quantidade_separada', iT, TORTO_1);
  await torto('itens_requisicao_almoxarifado', 'quantidade_entregue', iT, TORTO_03);
  await torto('itens_requisicao_almoxarifado', 'quantidade_atendida', iT, TORTO_03);
  await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?, ?, 2, 1.5, 0.3, 0.3)`, [req, mL]);
  // item da remessa
  const rem = (await dbRun(db, `INSERT INTO remessas_terceiro_almoxarifado (numero) VALUES ('E96T4-REM')`)).lastID;
  const remT = (await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade)
      VALUES (?, ?, 1)`, [rem, mT])).lastID;
  await torto('itens_remessa_terceiro_almoxarifado', 'quantidade_retornada', remT, TORTO_1);
  await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado (remessa_id, material_id, quantidade, quantidade_retornada)
      VALUES (?, ?, 2, 1.5)`, [rem, mL]);
  // item do recebimento (quantidade_recebida NULL no controle)
  const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero) VALUES ('E96T4-REC')`)).lastID;
  const recT = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id,
      quantidade_esperada) VALUES (?, ?, 1)`, [rec, mT])).lastID;
  await torto('recebimentos_material_itens_almoxarifado', 'quantidade_recebida', recT, TORTO_1);
  await torto('recebimentos_material_itens_almoxarifado', 'quantidade_em_inspecao', recT, TORTO_03);
  await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
      quantidade_recebida, quantidade_em_inspecao) VALUES (?, ?, 2, NULL, 0.3)`, [rec, mL]);
  // o livro: uma movimentacao com saldo torto, que NAO entra (B484)
  const movT = (await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior,
      saldo_posterior, motivo) VALUES (?, 'ENTRADA', 0.1, 0.8999999999999999, ?, 'e96t4 livro')`, [mT, TORTO_1])).lastID;
  // a conferencia: material proprio, aberta sobre o torto e contada 1 ANTES da normalizacao (sonda da Fase 0)
  const mC = await material('E96T4-CONF', { categoria: 'CAT-E96T4' });
  await torto('materiais_almoxarifado', 'quantidade_atual', mC, TORTO_1);

  const COLUNAS = L.COLUNAS_LEGADO.map((c) => `${c.tabela}.${c.coluna}`);

  await test('[96 RN-07] premissa: COLUNAS_LEGADO tem as 15 colunas do contrato (14 + o solicitado, Fase 5 R1), sem o livro nem a contagem', async () => {
    const montadas = [...new Set([...esperado.values()].map((e) => `${e.tabela}.${e.coluna}`))].sort();
    assert.deepStrictEqual([...COLUNAS].sort(), montadas);
    assert.strictEqual(COLUNAS.length, 15); // mudado na Etapa 96 Fase 5 (R1): era 14
    assert.ok(!COLUNAS.some((c) => /movimentacoes_almoxarifado|itens_conferencia_almoxarifado/.test(c)), COLUNAS.join());
  });

  let lista0 = [];
  await test('[96 RN-07] a A47 acha cada coluna torta, com o arredondado do ROUND do SQL, e nao acha os limpos', async () => {
    lista0 = await L.listarTortos(db);
    assert.deepStrictEqual(lista0.map(chave).sort(), [...esperado.keys()].sort(), JSON.stringify(lista0));
    for (const r of lista0) {
      const e = esperado.get(chave(r));
      assert.strictEqual(r.valor, e.valor, chave(r));
      const sql = await dbGet(db, `SELECT ROUND(${r.coluna}, 6) a FROM ${r.tabela} WHERE id = ?`, [r.id]);
      assert.strictEqual(r.arredondado, sql.a, `${chave(r)}: arredondado do SQL`);
      assert.strictEqual(r.arredondado, e.valor === TORTO_1 ? 1 : 0.3, chave(r));
    }
    assert.ok(!lista0.some((r) => r.id === mL && r.tabela === 'materiais_almoxarifado'), 'controle 1,5 / 0,3 achado');
  });

  await test('[96 RN-07] a A47 acha a linha de endereco (estoque_saldo_almoxarifado)', async () => {
    assert.ok(lista0.some((r) => r.tabela === 'estoque_saldo_almoxarifado' && r.id === sT), JSON.stringify(lista0));
  });

  // conferencia aberta sobre o torto, contada 1
  const conf = (await request(app).post(`${API}/conferencias`).send({ categoria: 'CAT-E96T4', tolerancia_percentual: 100 })).body;
  const itemConf = await dbGet(db, 'SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?',
    [conf.id, mC]);

  await test('[96 RN-07] premissa: a conferencia abriu sobre o torto e a contagem de 1 entrou', async () => {
    assert.ok(itemConf, `conferencia: ${JSON.stringify(conf)}`);
    assert.strictEqual(itemConf.quantidade_sistema, TORTO_1);
    const r = await request(app).put(`${API}/conferencias/${conf.id}/item/${itemConf.id}`).send({ quantidade_contada: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[96 RN-07] normalizar sem aplicar so conta: nada gravado', async () => {
    const r = await L.normalizar(db, { aplicar: false });
    assert.strictEqual(r.aplicado, false);
    assert.deepStrictEqual(r.porColuna.map((c) => `${c.tabela}.${c.coluna}`), COLUNAS);
    const porColuna = Object.fromEntries(r.porColuna.map((c) => [`${c.tabela}.${c.coluna}`, c.linhas]));
    assert.strictEqual(porColuna['materiais_almoxarifado.quantidade_atual'], 2);
    for (const c of COLUNAS.filter((x) => x !== 'materiais_almoxarifado.quantidade_atual')) {
      assert.strictEqual(porColuna[c], 1, c);
    }
    for (const e of esperado.values()) {
      const lido = await dbGet(db, `SELECT ${e.coluna} v FROM ${e.tabela} WHERE id = ?`, [e.id]);
      assert.strictEqual(lido.v, e.valor, `${e.tabela}.${e.coluna} foi gravado sem --aplicar`);
    }
  });

  // ── A CLI, sobre uma copia do banco da suite ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e96t4-'));
  const arquivo = path.join(tmp, 'database.sqlite');
  await dbRun(db, `VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);

  await test('[96 RN-07] a CLI sem --aplicar lista cada coluna e nao grava', async () => {
    const r = rodarCli(tmp);
    assert.strictEqual(r.status, 0, `saida ${r.status}: ${r.stderr}`);
    for (const c of COLUNAS) {
      const n = c === 'materiais_almoxarifado.quantidade_atual' ? 2 : 1;
      assert.ok(r.stdout.includes(`${c}: ${n} linha(s)`), `${c} ausente: ${r.stdout}`);
    }
    assert.ok(r.stdout.includes('Nada gravado. Rode com --aplicar para normalizar.'), r.stdout);
    assert.ok(r.stdout.includes('0.9999999999999999'), `o valor torto nao foi listado: ${r.stdout}`);
    const c = await abrir(arquivo);
    try {
      const ainda = await L.listarTortos(c);
      assert.strictEqual(ainda.length, esperado.size, 'a CLI gravou sem --aplicar');
    } finally { await fechar(c); }
  });

  await test('[96 RN-07] a CLI com --aplicar grava o ROUND, a consulta volta vazia e rodar de novo da 0', async () => {
    const r = rodarCli(tmp, ['--aplicar']);
    assert.strictEqual(r.status, 0, `saida ${r.status}: ${r.stderr}`);
    assert.ok(r.stdout.includes('materiais_almoxarifado.quantidade_atual: 2 linha(s)'), r.stdout);
    assert.ok(r.stdout.includes('Normalizado.'), r.stdout);
    const c = await abrir(arquivo);
    try {
      assert.deepStrictEqual(await L.listarTortos(c), []);
      for (const t of lista0) {
        const lido = await dbGet(c, `SELECT ${t.coluna} v FROM ${t.tabela} WHERE id = ?`, [t.id]);
        assert.strictEqual(lido.v, t.arredondado, chave(t));
      }
      const livro = await dbGet(c, 'SELECT saldo_posterior s FROM movimentacoes_almoxarifado WHERE id = ?', [movT]);
      assert.strictEqual(livro.s, TORTO_1, 'a CLI reescreveu o livro');
    } finally { await fechar(c); }
    const deNovo = rodarCli(tmp, ['--aplicar']);
    assert.strictEqual(deNovo.status, 0, deNovo.stderr);
    for (const col of COLUNAS) assert.ok(deNovo.stdout.includes(`${col}: 0 linha(s)`), `${col}: ${deNovo.stdout}`);
  });

  await test('[96 RN-07] a CLI sem banco no CRM_DATA_DIR recusa e nao cria arquivo', async () => {
    const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'e96t4-vazio-'));
    try {
      const r = rodarCli(vazio);
      assert.notStrictEqual(r.status, 0, r.stdout);
      assert.ok(!fs.existsSync(path.join(vazio, 'database.sqlite')), 'a CLI criou um banco vazio');
    } finally { fs.rmSync(vazio, { recursive: true, force: true }); }
  });
  fs.rmSync(tmp, { recursive: true, force: true });

  // ── O servico, no banco da suite ──
  await test('[96 RN-07] normalizar com aplicar grava o ROUND do SQL, a consulta volta vazia, idempotente', async () => {
    const r = await L.normalizar(db, { aplicar: true });
    assert.strictEqual(r.aplicado, true);
    const total = r.porColuna.reduce((s, c) => s + c.linhas, 0);
    assert.strictEqual(total, esperado.size, JSON.stringify(r.porColuna));
    for (const t of lista0) {
      const lido = await dbGet(db, `SELECT ${t.coluna} v FROM ${t.tabela} WHERE id = ?`, [t.id]);
      assert.strictEqual(lido.v, t.arredondado, chave(t));
    }
    assert.deepStrictEqual(await L.listarTortos(db), []);
    const deNovo = await L.normalizar(db, { aplicar: true });
    assert.ok(deNovo.porColuna.every((c) => c.linhas === 0), JSON.stringify(deNovo.porColuna));
    const limpo = await dbGet(db, 'SELECT quantidade_atual a, quantidade_reservada r FROM materiais_almoxarifado WHERE id = ?', [mL]);
    assert.deepStrictEqual(limpo, { a: 1.5, r: 0.3 });
  });

  await test('[96 RN-07] o livro (movimentacoes_almoxarifado) fica intacto (B484)', async () => {
    const livro = await dbGet(db, 'SELECT saldo_anterior a, saldo_posterior s FROM movimentacoes_almoxarifado WHERE id = ?', [movT]);
    assert.deepStrictEqual(livro, { a: 0.8999999999999999, s: TORTO_1 });
  });

  await test('[96 RN-07] a conferencia aberta sobre o torto conclui com aplicar_ajustes sem movimentacao nova', async () => {
    const antes = (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [mC])).n;
    const r = await request(app).put(`${API}/conferencias/${conf.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'e96t4' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const depois = (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [mC])).n;
    assert.strictEqual(depois, antes, 'ajuste fantasma');
    const m = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mC]);
    assert.strictEqual(m.q, 1);
  });

  terminou = true;
  console.log(`\n  ${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
