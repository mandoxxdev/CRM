/**
 * Etapa 67, Task 2 (galho, servidor) — chave `ajustes-por-motivo` do registro de relatorios.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa67-indicadores-spec27.md (T2, RN-06,
 * RN-07; a secao "Fase 2 — revisao do plano" prevalece: paridade da RN-07 com as condicoes
 * DECLARADAS — mesmo dia, menos de 500 linhas, sem material de cliente —, sem CTE).
 *
 * Prova:
 *   - os tres baldes (Cadastro / Inventario / Texto livre) com a regua UNICA do `indicadores`
 *     (reportService.ajustesWhereSql, da T1): PERDA nao conta, estornado nao conta, material de
 *     cliente nao conta, material inativado conta;
 *   - o motivo aparece pelo nome ATUAL do cadastro: ajuste antes e depois de renomear = UMA linha
 *     (o livro guarda os dois nomes — metade positiva pelo historico);
 *   - texto digitado igual ao nome do motivo NAO cai na linha do motivo;
 *   - motivo desativado ganha o sufixo " (desativado)";
 *   - periodo e material filtram; `material_id` mal formado -> 400 literal; vazio = sem filtro;
 *   - RN-07: Σ ajustes = indicadores.ajustes.total = linhas do historico grupo=AJUSTE dos
 *     materiais proprios (banco proprio, para os numeros serem exatos);
 *   - registro/lista: gate null (usuario sem perfil abre), export XLSX com os cabecalhos.
 *
 * Executar: cd server && node tests/api/relatorioAjustesPorMotivo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');
const reportService = require('../../services/almoxarifado/reportService');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 672, nome: 'Admin E67T2', role: 'admin', is_superadmin: 1, email: 'e67t2@test.com' };
const PRODUCAO = { id: 6729, nome: 'Producao E67T2', role: 'usuario' };
const URL_REL = '/api/almoxarifado/relatorios/ajustes-por-motivo';
const FORMATO = 'Parâmetro "material_id" deve ser um número inteiro positivo';
const SEM_MOTIVO = 'Sem motivo do cadastro';
const INVENTARIO = 'Ajuste de conferência de inventário';

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

let seq = 0;
const uniq = (p) => `${p} ${Date.now() % 1000000}-${++seq}`;

/** Monta os helpers sobre um app (o cenario RN-07 usa um banco proprio). */
function helpers(app, db, setUser) {
  const v2 = (body) => { setUser({ ...ADMIN }); return request(app).post('/api/almoxarifado/movimentacoes/v2').send(body); };
  const ok = async (body) => {
    const r = await v2(body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const material = async ({ saldo = 100, cliente = null } = {}) => {
    const c = `E67T2-${++seq}`;
    const loc = (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id, proprietario_cliente_id)
      VALUES (?, ?, 'UN', 0, 1, 'ACO', ?, ?)`, [c, `Mat ${c}`, loc, cliente])).lastID;
    await ok({ material_id: id, tipo: 'ENTRADA', quantidade: saldo, localizacao_destino_id: loc, motivo: 'setup' });
    return id;
  };
  const motivo = async (nome, tipos = ['AJUSTE_NEGATIVO', 'AJUSTE_POSITIVO', 'PERDA']) => {
    setUser({ ...ADMIN });
    const r = await request(app).post('/api/almoxarifado/motivos-movimentacao').send({ nome, tipos });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const rel = async (qs = '') => {
    setUser({ ...ADMIN });
    const r = await request(app).get(`${URL_REL}${qs}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body), JSON.stringify(r.body));
    return r.body;
  };
  // Conferencia de inventario com UM item contado com divergencia -> AJUSTE_INVENTARIO pelo motor.
  const ajusteInventario = async (materialId, contada) => {
    setUser({ ...ADMIN });
    const conf = await request(app).post('/api/almoxarifado/conferencias').send({ tolerancia_percentual: 1000 });
    assert.strictEqual(conf.status, 201, JSON.stringify(conf.body));
    const item = await dbGet(db, 'SELECT id FROM itens_conferencia_almoxarifado WHERE conferencia_id = ? AND material_id = ?', [conf.body.id, materialId]);
    assert.ok(item, 'o material nao entrou na conferencia');
    const ct = await request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/item/${item.id}`).send({ quantidade_contada: contada });
    assert.strictEqual(ct.status, 200, JSON.stringify(ct.body));
    const cc = await request(app).put(`/api/almoxarifado/conferencias/${conf.body.id}/concluir`)
      .send({ aplicar_ajustes: true, justificativa_ajuste: 'E67T2 inventario' });
    assert.strictEqual(cc.status, 200, JSON.stringify(cc.body));
  };
  return { v2, ok, material, motivo, rel, ajusteInventario };
}

(async () => {
  console.log('\n=== Etapa 67 Task 2: relatorio ajustes-por-motivo ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const { ok, material, motivo, rel, ajusteInventario } = helpers(app, db, setUser);
  const HOJE = (await dbGet(db, "SELECT date('now') AS d")).d;
  const ONTEM = (await dbGet(db, "SELECT date('now', '-1 days') AS d")).d;

  // ══════════════ registro e lista ══════════════
  await test('[RN-11] registro: titulo, categoria, gate null, exportavel, params e colunas do contrato', async () => {
    const e = RELATORIOS['ajustes-por-motivo'];
    assert.ok(e, 'chave ajustes-por-motivo nao declarada no registro');
    assert.strictEqual(e.titulo, 'Ajustes por motivo');
    assert.strictEqual(e.categoria, 'Movimentações');
    assert.ok('acao' in e && e.acao === null, 'gate tem de ser null EXPLICITO');
    assert.strictEqual(e.exportavel, true);
    assert.strictEqual(e.limite, null);
    assert.deepStrictEqual(e.params.map((p) => [p.nome, p.tipo]),
      [['data_inicio', 'date'], ['data_fim', 'date'], ['material_id', 'number']]);
    assert.strictEqual(e.params.find((p) => p.nome === 'material_id').rotulo, 'Material');
    assert.deepStrictEqual(e.colunas.map((c) => [c.chave, c.rotulo]), [
      ['origem', 'Origem'], ['motivo_id', 'Motivo (id)'], ['motivo', 'Motivo'], ['ajustes', 'Ajustes'],
      ['materiais', 'Materiais'], ['ultimo_em', 'Último em'],
    ]);
    for (const frase of [
      'Conta os lançamentos AJUSTE, AJUSTE_POSITIVO, AJUSTE_NEGATIVO e AJUSTE_INVENTARIO',
      'O motivo do cadastro aparece pelo nome ATUAL',
      '"Sem motivo do cadastro", mesmo que o texto digitado seja igual ao nome de um motivo',
      'Materiais de clientes ficam fora; material inativado conta.',
      'As datas comparam o DIA em UTC.',
      'Histórico de movimentações',
    ]) assert.ok(e.nota.includes(frase), `nota sem "${frase}": ${e.nota}`);
  });

  await test('[RN-11] usuario SEM perfil (PRODUCAO) ve a chave na lista e abre o relatorio (200)', async () => {
    setUser({ ...PRODUCAO });
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(lista.status, 200);
    assert.ok(lista.body.relatorios.some((r) => r.tipo === 'ajustes-por-motivo'), 'fora da lista do PRODUCAO');
    const r = await request(app).get(URL_REL);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    setUser({ ...ADMIN });
  });

  // ══════════════ RN-06: os tres baldes ══════════════
  const mA = await material();
  const M = await motivo(uniq('Avaria E67T2'));
  // 1) ajuste com motivo do cadastro, com o nome ORIGINAL
  await ok({ material_id: mA, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: M.id, justificativa: 'antes de renomear' });
  // 2) texto livre com EXATAMENTE o nome do motivo — nao pode cair na linha do motivo
  await ok({ material_id: mA, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo: M.nome, justificativa: M.nome });
  // 3) ajuste de conferencia de inventario
  await ajusteInventario(mA, 90);

  await test('[RN-06 +] tres baldes no material: Cadastro (1), Texto livre (1), Inventario (1)', async () => {
    const linhas = await rel(`?material_id=${mA}`);
    assert.strictEqual(linhas.length, 3, JSON.stringify(linhas));
    const cad = linhas.find((l) => l.origem === 'Cadastro');
    assert.ok(cad, JSON.stringify(linhas));
    assert.strictEqual(cad.motivo_id, M.id);
    assert.strictEqual(cad.motivo, M.nome);
    assert.strictEqual(cad.ajustes, 1);
    assert.strictEqual(cad.materiais, 1);
    const livre = linhas.find((l) => l.origem === 'Texto livre');
    assert.ok(livre, JSON.stringify(linhas));
    assert.strictEqual(livre.motivo, SEM_MOTIVO);
    assert.strictEqual(livre.motivo_id, null);
    assert.strictEqual(livre.ajustes, 1, 'o texto igual ao nome do motivo tem de cair em "Sem motivo do cadastro"');
    const inv = linhas.find((l) => l.origem === 'Inventário');
    assert.ok(inv, JSON.stringify(linhas));
    assert.strictEqual(inv.motivo, INVENTARIO);
    assert.strictEqual(inv.motivo_id, null);
    assert.strictEqual(inv.ajustes, 1);
    for (const l of linhas) {
      assert.ok(typeof l.ultimo_em === 'string' && l.ultimo_em.startsWith(HOJE), `ultimo_em: ${JSON.stringify(l)}`);
    }
  });

  await test('[RN-06] renomear o motivo JUNTA: ajuste antes e depois do novo nome = UMA linha com o nome atual', async () => {
    setUser({ ...ADMIN });
    const novoNome = uniq('Avaria renomeada E67T2');
    const put = await request(app).put(`/api/almoxarifado/motivos-movimentacao/${M.id}`).send({ nome: novoNome });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    await ok({ material_id: mA, tipo: 'AJUSTE_POSITIVO', quantidade: 1, motivo_id: M.id, justificativa: 'depois de renomear' });
    // metade positiva: o LIVRO guarda os dois nomes (o do momento)
    const hist = await request(app).get(`/api/almoxarifado/relatorios/historico-movimentacoes?motivo_id=${M.id}`);
    assert.strictEqual(hist.status, 200);
    const nomesNoLivro = new Set(hist.body.map((h) => h.motivo));
    assert.ok(nomesNoLivro.has(M.nome) && nomesNoLivro.has(novoNome), `o livro devia ter os dois nomes: ${[...nomesNoLivro]}`);
    const linhas = await rel(`?material_id=${mA}`);
    const cad = linhas.filter((l) => l.origem === 'Cadastro');
    assert.strictEqual(cad.length, 1, `renomear partiu a linha: ${JSON.stringify(cad)}`);
    assert.strictEqual(cad[0].motivo, novoNome);
    assert.strictEqual(cad[0].ajustes, 2);
    // ordem: ajustes DESC, motivo
    assert.strictEqual(linhas[0].origem, 'Cadastro', `ordem por ajustes DESC: ${JSON.stringify(linhas)}`);
    M.nome = novoNome;
  });

  await test('[RN-06] motivo DESATIVADO aparece com o sufixo " (desativado)" e continua contado', async () => {
    setUser({ ...ADMIN });
    const d = await request(app).delete(`/api/almoxarifado/motivos-movimentacao/${M.id}`);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const cad = (await rel(`?material_id=${mA}`)).filter((l) => l.origem === 'Cadastro');
    assert.strictEqual(cad.length, 1, JSON.stringify(cad));
    assert.strictEqual(cad[0].motivo, `${M.nome} (desativado)`);
    assert.strictEqual(cad[0].ajustes, 2);
  });

  // ══════════════ RN-06 (−): a regua unica do indicadores ══════════════
  await test('[RN-06 -] PERDA com motivo nao conta; estornado nao conta; cliente fora; inativado conta', async () => {
    const P = await motivo(uniq('Perda E67T2'));
    const mB = await material();
    await ok({ material_id: mB, tipo: 'PERDA', quantidade: 1, motivo_id: P.id, justificativa: 'perda' });
    const est = await ok({ material_id: mB, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: P.id, justificativa: 'sera estornado' });
    const meio = await rel(`?material_id=${mB}`);
    assert.strictEqual(meio.length, 1, `so o AJUSTE devia contar (PERDA fora): ${JSON.stringify(meio)}`);
    assert.strictEqual(meio[0].ajustes, 1);
    const movId = est.id || est.movimentacao?.id
      || (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE_NEGATIVO' ORDER BY id DESC LIMIT 1", [mB])).id;
    setUser({ ...ADMIN });
    const c = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'E67T2 estorno' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(await rel(`?material_id=${mB}`), [], 'o estornado (nem o ESTORNO) nao pode contar');

    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E67T2')")).lastID;
    const mCli = await material({ cliente: cli });
    await ok({ material_id: mCli, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: P.id, justificativa: 'cliente' });
    assert.deepStrictEqual(await rel(`?material_id=${mCli}`), [], 'material de cliente tem de ficar fora');

    const mInat = await material();
    await ok({ material_id: mInat, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: P.id, justificativa: 'inativado' });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [mInat]);
    const inat = await rel(`?material_id=${mInat}`);
    assert.strictEqual(inat.length, 1, `material inativado tem de contar: ${JSON.stringify(inat)}`);
    assert.strictEqual(inat[0].ajustes, 1);
  });

  // ══════════════ filtros ══════════════
  await test('[filtros] periodo pelo DIA (UTC) e material: hoje inclui, ontem exclui; outro material nao entra', async () => {
    const hoje = await rel(`?material_id=${mA}&data_inicio=${HOJE}&data_fim=${HOJE}`);
    assert.strictEqual(hoje.reduce((s, l) => s + l.ajustes, 0), 4, JSON.stringify(hoje));
    assert.deepStrictEqual(await rel(`?material_id=${mA}&data_fim=${ONTEM}`), []);
    assert.deepStrictEqual(await rel(`?material_id=${mA}&data_inicio=9999-01-01`), []);
    const todos = await rel('');
    const doA = await rel(`?material_id=${mA}`);
    assert.ok(todos.reduce((s, l) => s + l.ajustes, 0) > doA.reduce((s, l) => s + l.ajustes, 0),
      'sem o filtro de material o total tinha de ser maior (ha ajustes de outros materiais)');
    const cadTodos = todos.find((l) => l.origem === 'Cadastro' && l.motivo_id === M.id);
    assert.strictEqual(cadTodos.ajustes, 2);
  });

  await test('[400] material_id mal formado -> 400 literal; vazio = sem filtro', async () => {
    setUser({ ...ADMIN });
    for (const mal of ['0', 'abc', '1.5', '-3', '7x']) {
      const r = await request(app).get(`${URL_REL}?material_id=${encodeURIComponent(mal)}`);
      assert.strictEqual(r.status, 400, `material_id=${mal}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, FORMATO);
    }
    const vazio = await request(app).get(`${URL_REL}?material_id=`);
    assert.strictEqual(vazio.status, 200, JSON.stringify(vazio.body));
    assert.ok(vazio.body.length > 0);
  });

  await test('[RN-11] export XLSX: cabecalhos do contrato e as mesmas linhas da rota', async () => {
    setUser({ ...ADMIN });
    const res = await request(app).get(`${URL_REL}/export?material_id=${mA}`).buffer().parse(binaryParser);
    assert.strictEqual(res.status, 200, String(res.body).slice(0, 200));
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    assert.deepStrictEqual(linhas[0], ['Origem', 'Motivo (id)', 'Motivo', 'Ajustes', 'Materiais', 'Último em']);
    assert.strictEqual(linhas.length - 1, 3, JSON.stringify(linhas));
    assert.ok(linhas.some((l) => l[2] === SEM_MOTIVO && l[3] === 1), JSON.stringify(linhas));
  });

  await close();

  // ══════════════ RN-07: paridade, em banco PROPRIO (numeros exatos) ══════════════
  await test('[RN-07] mesmo dia, sem material de cliente: Σ por motivo = indicadores.ajustes.total = historico grupo=AJUSTE', async () => {
    const b = await createTestApp({ user: { ...ADMIN } });
    try {
      const h = helpers(b.app, b.db, b.setUser);
      const hoje = (await dbGet(b.db, "SELECT date('now') AS d")).d;
      const p1 = await h.material();
      const p2 = await h.material();
      const cli = (await dbRun(b.db, "INSERT INTO clientes (razao_social) VALUES ('Cliente RN07')")).lastID;
      const c1 = await h.material({ cliente: cli });
      const Mo = await h.motivo(uniq('Paridade E67T2'));
      await h.ok({ material_id: p1, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: Mo.id, justificativa: 'cadastro' });
      await h.ok({ material_id: p1, tipo: 'AJUSTE_POSITIVO', quantidade: 2, motivo: 'texto livre', justificativa: 'livre' });
      await h.ajusteInventario(p2, 95);
      // o de CLIENTE: o historico o mostra; os dois relatorios da regua unica, nao
      await h.ok({ material_id: c1, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: Mo.id, justificativa: 'cliente' });
      // Fase 5 (A): um ajuste de 60 dias atras — fora da janela de 1 dia do indicadores e fora do
      // periodo de hoje dos outros dois. Semeado (declarado): a rota grava created_at = agora.
      const velho = await h.ok({ material_id: p2, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: Mo.id, justificativa: 'velho' });
      const velhoId = velho.id || velho.movimentacao?.id
        || (await dbGet(b.db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE_NEGATIVO' ORDER BY id DESC LIMIT 1", [p2])).id;
      await dbRun(b.db, "UPDATE movimentacoes_almoxarifado SET created_at = datetime('now', '-60 days') WHERE id = ?", [velhoId]);
      const semPeriodo = await h.rel('');
      assert.strictEqual(semPeriodo.reduce((s, l) => s + l.ajustes, 0), 4, 'controle: sem periodo o ajuste velho aparece');

      const porMotivo = await h.rel(`?data_inicio=${hoje}&data_fim=${hoje}`);
      const somaMotivo = porMotivo.reduce((s, l) => s + l.ajustes, 0);
      b.setUser({ ...ADMIN });
      const ind = await request(b.app).get('/api/almoxarifado/relatorios/indicadores?janela_dias=1');
      assert.strictEqual(ind.status, 200, JSON.stringify(ind.body));
      const hist = await request(b.app).get(`/api/almoxarifado/relatorios/historico-movimentacoes?grupo=AJUSTE&data_inicio=${hoje}&data_fim=${hoje}`);
      assert.strictEqual(hist.status, 200, JSON.stringify(hist.body));
      assert.strictEqual(hist.body.length, 4, `historico devia trazer os 4 (com o de cliente): ${hist.body.length}`);
      const histProprios = hist.body.filter((l) => l.material_id !== c1).length;

      assert.strictEqual(somaMotivo, 3, JSON.stringify(porMotivo));
      assert.strictEqual(ind.body.ajustes.total, 3, JSON.stringify(ind.body.ajustes));
      assert.strictEqual(histProprios, 3);
      assert.deepStrictEqual(porMotivo.map((l) => l.origem).sort(), ['Cadastro', 'Inventário', 'Texto livre']);

      // pelo SERVICO: o mesmo payload da rota
      const svc = await reportService.relatorioAjustesPorMotivo(b.db, { data_inicio: hoje, data_fim: hoje });
      assert.deepStrictEqual(svc, porMotivo);
    } finally { await b.close(); }
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
