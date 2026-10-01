/**
 * Etapa 67, Task 3 (galho, servidor) — chave `qualidade-fornecedores`: divergencia de recebimento
 * e indice de rejeicao por fornecedor (spec 27, "Indicadores principais").
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa67-indicadores-spec27.md (T3, RN-08,
 * RN-09, RN-10, D6-D9; a secao "Fase 2 — revisao do plano" prevalece).
 *
 * ── "Conferido" = a conferencia foi FINALIZADA (Fase 2, critico 2 — medido nesta task) ─────────
 * Todo item NASCE com quantidade_recebida preenchida (o INSERT grava `quantidade_recebida || qtd`),
 * entao `quantidade_recebida IS NOT NULL` contaria item que ninguem contou. A Fase 2 sugeriu dois
 * sinais; os dois foram medidos e descartados:
 *   - `conferencia_quantidade = 1`: a TELA manda `conferencia_quantidade: recebida === esperada`
 *     (RecebimentosAlmoxarifado.js, salvarConferencia) — o item DIVERGENTE grava 0, igual ao
 *     default. Com essa regua o indice de divergencia seria zero por construcao.
 *   - status >= CONFERIDO_ALMOX: `POST /recebimentos/:id/aprovar` leva RECEBIDO direto a APROVADO
 *     e `encaminhar_compras` aceita RECEBIDO — os dois pulam a conferencia.
 * O sinal escolhido e o que SO o gesto "Finalizar Conferencia" escreve: a auditoria
 * FINALIZAR_CONFERENCIA do recebimento (receiptService.avancarWorkflow; existe desde o primeiro
 * commit do modulo). Os cenarios abaixo provam as duas metades: criado e nunca conferido = 0;
 * so "Salvar Conferencia" sem finalizar = 0; finalizado = conta, inclusive o divergente que a tela
 * gravou com conferencia_quantidade = 0.
 *
 * Fluxo: recebimento pela ROTA (POST /recebimentos -> workflow iniciar -> PUT /conferir no formato
 * da tela -> workflow finalizar -> POST /aprovar). O /aprovar e o caminho de API que leva o item
 * critico a quarentena sem os dados fiscais do /processar — o relatorio le so os fatos gravados.
 * Inspecao pela rota /inspecionar; NC e devolucao ao fornecedor pelas rotas da Etapa 45. Duas
 * linhas ficam semeadas a mao, declaradas: a inspecao LEGADA sem quantidades e a SEGUNDA inspecao do
 * mesmo item (RN-10 / M-4: nenhum caminho real retem duas vezes).
 *
 * Executar: cd server && node tests/api/relatorioQualidadeFornecedores.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun, dbAll } = require('../../services/almoxarifado/db');
const reportService = require('../../services/almoxarifado/reportService');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 673, nome: 'Admin E67T3', role: 'admin', is_superadmin: 1, email: 'e67t3@test.com' };
const PRODUCAO = { id: 6739, nome: 'Producao E67T3', role: 'usuario' };
const URL_REL = '/api/almoxarifado/relatorios/qualidade-fornecedores';

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

const SUF = `${Date.now() % 100000}`;
let seq = 0;

(async () => {
  console.log('\n=== Etapa 67 Task 3: relatorio qualidade-fornecedores ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const HOJE = (await dbGet(db, "SELECT date('now') AS d")).d;
  const ONTEM = (await dbGet(db, "SELECT date('now', '-1 days') AS d")).d;
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico','1')
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
  const clienteId = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E67T3')")).lastID;

  const material = async ({ critico = false, cliente = null } = {}) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo, material_critico, controle_lote, proprietario_cliente_id)
    VALUES (?, ?, 'UN', 0, 1, ?, 0, ?)`, [`E67T3-${++seq}`, `Mat E67T3 ${seq}`, critico ? 1 : 0, cliente])).lastID;

  /** POST /recebimentos (NF avulsa). itens: [[material_id, quantidade]]. Devolve { id, itens: [ids] }. */
  const receber = async ({ fornecedor_id, fornecedor_nome, fornecedor_cnpj } = {}, itens) => {
    setUser({ ...ADMIN });
    const r = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-E67T3-${SUF}-${++seq}`,
      fornecedor_id, fornecedor_nome, fornecedor_cnpj,
      itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })),
    });
    assert.strictEqual(r.status, 201, `POST /recebimentos: ${JSON.stringify(r.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [r.body.id])).map((x) => x.id);
    return { id: r.body.id, itens: ids };
  };
  const workflow = async (id, acao) => {
    setUser({ ...ADMIN });
    const r = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });
    assert.strictEqual(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`);
  };
  /** PUT /conferir no FORMATO DA TELA: quantidade + conferencia_quantidade = (recebida === esperada). */
  const salvarConferencia = async (id, pares) => {
    setUser({ ...ADMIN });
    const itens = [];
    for (const [itemId, recebida] of pares) {
      // eslint-disable-next-line no-await-in-loop
      const it = await dbGet(db, 'SELECT quantidade_esperada FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);
      itens.push({ id: itemId, quantidade_recebida: recebida, conferencia_quantidade: recebida === Number(it.quantidade_esperada) });
    }
    const r = await request(app).put(`/api/almoxarifado/recebimentos/${id}/conferir`).send({ itens, autorizar_excedente: true });
    assert.strictEqual(r.status, 200, `conferir: ${JSON.stringify(r.body)}`);
  };
  /** O ciclo completo da conferencia na tela: iniciar -> salvar -> finalizar. */
  const conferir = async (id, pares) => {
    await workflow(id, 'iniciar_conferencia');
    await salvarConferencia(id, pares);
    await workflow(id, 'finalizar_conferencia');
  };
  const aprovar = async (id) => {
    setUser({ ...ADMIN });
    const r = await request(app).post(`/api/almoxarifado/recebimentos/${id}/aprovar`).send({});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const inspecionar = async (itemId, aprovada, reprovada, extra = {}) => {
    setUser({ ...ADMIN });
    const r = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: aprovada, quantidade_reprovada: reprovada, ...extra });
    assert.strictEqual(r.status, 201, `inspecionar: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const rel = async (qs = `?data_inicio=${HOJE}&data_fim=${HOJE}`) => {
    setUser({ ...ADMIN });
    const r = await request(app).get(`${URL_REL}${qs}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body), JSON.stringify(r.body));
    return r.body;
  };
  const linha = async (fornecedor, qs) => (await rel(qs)).filter((l) => l.fornecedor === fornecedor);
  const umaLinha = async (fornecedor, qs) => {
    const ls = await linha(fornecedor, qs);
    assert.strictEqual(ls.length, 1, `esperava 1 linha de "${fornecedor}": ${JSON.stringify(ls)}`);
    return ls[0];
  };

  // ══════════════ registro e lista ══════════════
  await test('[RN-11] registro: titulo, categoria Gestao, gate null, params e colunas do contrato; nota com as reguas', async () => {
    const e = RELATORIOS['qualidade-fornecedores'];
    assert.ok(e, 'chave qualidade-fornecedores nao declarada');
    assert.strictEqual(e.titulo, 'Qualidade por fornecedor');
    assert.strictEqual(e.categoria, 'Gestão');
    assert.ok('acao' in e && e.acao === null);
    assert.strictEqual(e.exportavel, true);
    assert.strictEqual(e.limite, null);
    assert.deepStrictEqual(e.params.map((p) => [p.nome, p.tipo]), [['data_inicio', 'date'], ['data_fim', 'date']]);
    assert.deepStrictEqual(e.colunas.map((c) => c.chave), [
      'fornecedor', 'recebimentos', 'itens_conferidos', 'itens_divergentes', 'itens_com_falta', 'itens_com_sobra',
      'percentual_divergencia', 'inspecoes', 'inspecoes_com_reprovacao', 'indice_rejeicao',
    ]);
    const rot = Object.fromEntries(e.colunas.map((c) => [c.chave, c.rotulo]));
    assert.strictEqual(rot.fornecedor, 'Fornecedor');
    assert.strictEqual(rot.indice_rejeicao, '% rejeição');
    assert.ok(/conferência finalizada/i.test(rot.itens_conferidos), `a coluna tem de dizer a regua: ${rot.itens_conferidos}`);
    for (const frase of [
      'Finalizar Conferência',
      'entrega parcial combinada',
      'CNPJ',
      'recebimento mais recente',
      'Materiais de clientes ficam fora',
      'Liberação posterior por não conformidade e devolução ao fornecedor não mudam o índice',
      'data inválida devolve a lista vazia',
    ]) assert.ok(e.nota.includes(frase), `nota sem "${frase}": ${e.nota}`);
  });

  await test('[RN-11] usuario SEM perfil lista e abre (200)', async () => {
    setUser({ ...PRODUCAO });
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    assert.ok(lista.body.relatorios.some((r) => r.tipo === 'qualidade-fornecedores'));
    const r = await request(app).get(URL_REL);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    setUser({ ...ADMIN });
  });

  // ══════════════ Fase 2 critico 2: "conferido" e sinal EXPLICITO ══════════════
  await test('[conferido] criado e nunca conferido = 0; so salvar sem finalizar = 0; finalizado = conta (divergente com conferencia_quantidade 0)', async () => {
    const F = `Forn Conferido ${SUF}`;
    const m = await material();
    const rec = await receber({ fornecedor_nome: F }, [[m, 10]]);
    // o INSERT ja nasce com recebida = esperada: a regua antiga contaria este item
    const it = await dbGet(db, 'SELECT quantidade_recebida, conferencia_quantidade FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [rec.itens[0]]);
    assert.strictEqual(it.quantidade_recebida, 10, 'premissa: o item nasce com recebida preenchida');
    let l = await umaLinha(F);
    assert.strictEqual(l.recebimentos, 1);
    assert.strictEqual(l.itens_conferidos, 0, `nunca conferido contou: ${JSON.stringify(l)}`);
    assert.strictEqual(l.percentual_divergencia, null);

    await workflow(rec.id, 'iniciar_conferencia');
    await salvarConferencia(rec.id, [[rec.itens[0], 8]]);
    l = await umaLinha(F);
    assert.strictEqual(l.itens_conferidos, 0, `salvar sem finalizar contou: ${JSON.stringify(l)}`);

    await workflow(rec.id, 'finalizar_conferencia');
    const gravado = await dbGet(db, 'SELECT conferencia_quantidade FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [rec.itens[0]]);
    assert.strictEqual(gravado.conferencia_quantidade, 0, 'premissa: a tela grava 0 no item divergente');
    l = await umaLinha(F);
    assert.strictEqual(l.itens_conferidos, 1, JSON.stringify(l));
    assert.strictEqual(l.itens_divergentes, 1, JSON.stringify(l));
    assert.strictEqual(l.itens_com_falta, 1);
    assert.strictEqual(l.percentual_divergencia, 100);
  });

  await test('[conferido -] /aprovar direto de RECEBIDO (pula a conferencia) = 0 conferidos', async () => {
    const F = `Forn Sem Conferencia ${SUF}`;
    const m = await material();
    const rec = await receber({ fornecedor_nome: F }, [[m, 10]]);
    await aprovar(rec.id);
    const l = await umaLinha(F);
    assert.strictEqual(l.itens_conferidos, 0, JSON.stringify(l));
    assert.strictEqual(l.percentual_divergencia, null);
  });

  // ══════════════ RN-08: divergencia ══════════════
  await test('[RN-08] falta, sobra autorizada e certo: 3 conferidos, 2 divergentes (1 falta, 1 sobra), 66.67%', async () => {
    const F = `Forn Divergencia ${SUF}`;
    const [a, b, c] = [await material(), await material(), await material()];
    const rec = await receber({ fornecedor_nome: F }, [[a, 10], [b, 10], [c, 5]]);
    await conferir(rec.id, [[rec.itens[0], 8], [rec.itens[1], 10], [rec.itens[2], 7]]);
    const l = await umaLinha(F);
    assert.strictEqual(l.recebimentos, 1);
    assert.strictEqual(l.itens_conferidos, 3, JSON.stringify(l));
    assert.strictEqual(l.itens_divergentes, 2, JSON.stringify(l));
    assert.strictEqual(l.itens_com_falta, 1);
    assert.strictEqual(l.itens_com_sobra, 1, 'excedente autorizado conta como sobra');
    assert.strictEqual(l.percentual_divergencia, 66.67);
    assert.strictEqual(l.inspecoes, 0);
    assert.strictEqual(l.indice_rejeicao, null, 'sem inspecao o indice e vazio, nunca 0');
  });

  await test('[RN-08] reconferir 8 -> 10 -> 8 (NC aberta, cancelada, reaberta) continua 1 item divergente', async () => {
    const F = `Forn Reconferido ${SUF}`;
    const m = await material();
    const rec = await receber({ fornecedor_nome: F }, [[m, 10]]);
    await workflow(rec.id, 'iniciar_conferencia');
    await salvarConferencia(rec.id, [[rec.itens[0], 8]]);
    await salvarConferencia(rec.id, [[rec.itens[0], 10]]);
    await salvarConferencia(rec.id, [[rec.itens[0], 8]]);
    await workflow(rec.id, 'finalizar_conferencia');
    const ncs = await dbAll(db, `SELECT status FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?`, [rec.itens[0]]);
    assert.ok(ncs.length >= 2, `premissa: varias NCs do mesmo item (${JSON.stringify(ncs)})`);
    const l = await umaLinha(F);
    assert.strictEqual(l.itens_conferidos, 1);
    assert.strictEqual(l.itens_divergentes, 1, `NC somou de novo: ${JSON.stringify(l)}`);
  });

  // ══════════════ RN-09: rejeicao ══════════════
  const F2 = `Forn Rejeicao ${SUF}`;
  const ctx = {};
  await test('[RN-09 +] inspecao 5/3 -> 1 inspecao, 1 com reprovacao, indice 100; a falta conta na divergencia', async () => {
    const m = await material({ critico: true });
    const rec = await receber({ fornecedor_nome: F2 }, [[m, 10]]);
    await conferir(rec.id, [[rec.itens[0], 8]]);
    await aprovar(rec.id);
    const retido = await dbGet(db, 'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [rec.itens[0]]);
    assert.strictEqual(retido.quantidade_em_inspecao, 8, `premissa: retido 8, veio ${retido.quantidade_em_inspecao}`);
    const insp = await inspecionar(rec.itens[0], 5, 3, { encaminhamento: 'DEVOLVER' });
    ctx.itemF2 = rec.itens[0]; ctx.inspF2 = insp.id;
    const l = await umaLinha(F2);
    assert.strictEqual(l.inspecoes, 1, JSON.stringify(l));
    assert.strictEqual(l.inspecoes_com_reprovacao, 1);
    assert.strictEqual(l.indice_rejeicao, 100);
    assert.strictEqual(l.itens_divergentes, 1);
    assert.strictEqual(l.itens_com_falta, 1);
    ctx.linhaF2 = l;
  });

  await test('[D7] NC decidida DEVOLVER e devolucao ao fornecedor EXECUTADA nao mudam a linha', async () => {
    assert.ok(ctx.inspF2, 'guarda: o cenario anterior criou a inspecao');
    setUser({ ...ADMIN });
    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO&limite=500');
    const nc = lista.body.itens.find((n) => n.referencia_tipo === 'INSPECAO' && n.referencia_id === ctx.inspF2);
    assert.ok(nc, 'a reprovacao nao abriu NC');
    const dec = await request(app).post(`/api/almoxarifado/nao-conformidades/${nc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'E67T3 devolver' });
    assert.strictEqual(dec.status, 200, JSON.stringify(dec.body));
    const exec = await request(app).post(`/api/almoxarifado/nao-conformidades/${nc.id}/executar`).send({ observacoes: 'E67T3' });
    assert.strictEqual(exec.status, 200, JSON.stringify(exec.body));
    const carimbo = await dbGet(db, 'SELECT devolucao_fornecedor_em FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [ctx.inspF2]);
    assert.ok(carimbo.devolucao_fornecedor_em, 'premissa: a devolucao foi executada');
    const ncsDoFornecedor = await dbGet(db, `SELECT COUNT(*) AS n FROM nao_conformidades_almoxarifado
      WHERE (referencia_tipo = 'INSPECAO' AND referencia_id = ?) OR (referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?)`,
    [ctx.inspF2, ctx.itemF2]);
    assert.ok(ncsDoFornecedor.n >= 2, `premissa: NC de inspecao e de quantidade existem (${ncsDoFornecedor.n})`);
    assert.deepStrictEqual(await umaLinha(F2), ctx.linhaF2);
  });

  await test('[RN-09 -] inspecao 100% aprovada -> indice 0 (nao vazio); inspecao legada sem quantidades nao conta', async () => {
    const F = `Forn Aprovado ${SUF}`;
    const m = await material({ critico: true });
    const rec = await receber({ fornecedor_nome: F }, [[m, 10]]);
    await conferir(rec.id, [[rec.itens[0], 10]]);
    await aprovar(rec.id);
    await inspecionar(rec.itens[0], 10, 0);
    let l = await umaLinha(F);
    assert.strictEqual(l.inspecoes, 1);
    assert.strictEqual(l.inspecoes_com_reprovacao, 0);
    assert.strictEqual(l.indice_rejeicao, 0, `100% aprovada tem de dar 0: ${JSON.stringify(l)}`);
    assert.strictEqual(l.itens_divergentes, 0);
    assert.strictEqual(l.percentual_divergencia, 0);
    // legada (antes da Etapa 5): sem quantidade_aprovada/reprovada — semeada a mao, declarado
    await dbRun(db, 'INSERT INTO inspecoes_recebimento_almoxarifado (recebimento_item_id, conforme) VALUES (?, 0)', [rec.itens[0]]);
    l = await umaLinha(F);
    assert.strictEqual(l.inspecoes, 1, `inspecao legada contou: ${JSON.stringify(l)}`);
  });

  await test('[RN-10] segunda inspecao do mesmo item: itens iguais, inspecoes +1 (sem dobra por juncao)', async () => {
    assert.ok(ctx.itemF2, 'guarda');
    const antes = await umaLinha(F2);
    // M-4: nenhum caminho real retem o mesmo item duas vezes — semeada a mao, declarado
    await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
      (recebimento_item_id, conforme, quantidade_aprovada, quantidade_reprovada) VALUES (?, 1, 1, 0)`, [ctx.itemF2]);
    const depois = await umaLinha(F2);
    assert.strictEqual(depois.itens_conferidos, antes.itens_conferidos);
    assert.strictEqual(depois.itens_divergentes, antes.itens_divergentes);
    assert.strictEqual(depois.itens_com_falta, antes.itens_com_falta);
    assert.strictEqual(depois.recebimentos, antes.recebimentos);
    assert.strictEqual(depois.inspecoes, antes.inspecoes + 1);
    assert.strictEqual(depois.inspecoes_com_reprovacao, antes.inspecoes_com_reprovacao);
    assert.strictEqual(depois.indice_rejeicao, 50);
  });

  // ══════════════ D8 (revisto na Fase 2): chave do fornecedor ══════════════
  await test('[D8] mesmo fornecedor_id com nomes diferentes = uma linha, com o nome do recebimento mais recente', async () => {
    const fid = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn Cadastro E67T3','ativo')")).lastID;
    const antigo = `Forn Id Antigo ${SUF}`; const novo = `Forn Id Novo ${SUF}`;
    const m = await material();
    await receber({ fornecedor_id: fid, fornecedor_nome: antigo }, [[m, 1]]);
    await receber({ fornecedor_id: fid, fornecedor_nome: novo }, [[m, 1]]);
    // o segundo e o mais recente: data igual ou maior, e no mesmo segundo o id maior desempata
    assert.deepStrictEqual(await linha(antigo), [], 'o nome antigo nao pode virar linha propria');
    const l = await umaLinha(novo);
    assert.strictEqual(l.recebimentos, 2);
  });

  await test('[D8] so nome, com espacos e maiusculas diferentes = uma linha; sem nada = "Sem fornecedor"', async () => {
    const m = await material();
    await receber({ fornecedor_nome: `  Metal ABC ${SUF}  ` }, [[m, 1]]);
    await receber({ fornecedor_nome: `metal  abc ${SUF}` }, [[m, 1]]);
    const linhas = (await rel()).filter((l) => l.fornecedor.toLowerCase().replace(/\s+/g, ' ').trim() === `metal abc ${SUF}`);
    assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
    assert.strictEqual(linhas[0].recebimentos, 2);
    await receber({}, [[m, 1]]);
    const sem = await umaLinha('Sem fornecedor');
    assert.ok(sem.recebimentos >= 1);
  });

  await test('[D8] o CNPJ vence: pontuado com id e so digitos sem id = uma linha', async () => {
    const fid = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn CNPJ E67T3','ativo')")).lastID;
    const m = await material();
    const nomeA = `Forn CNPJ A ${SUF}`; const nomeB = `Forn CNPJ B ${SUF}`;
    await receber({ fornecedor_id: fid, fornecedor_nome: nomeA, fornecedor_cnpj: '12.345.678/0001-90' }, [[m, 1]]);
    await receber({ fornecedor_nome: nomeB, fornecedor_cnpj: '12345678000190' }, [[m, 1]]);
    assert.deepStrictEqual(await linha(nomeA), [], 'CNPJ igual partiu em duas linhas');
    const l = await umaLinha(nomeB);
    assert.strictEqual(l.recebimentos, 2);
  });

  // ══════════════ D9 / M-2: material de cliente fora ══════════════
  await test('[D9/M-2] recebimento so de material de cliente nao aparece; o item de cliente de um misto nao conta', async () => {
    const Fc = `Forn So Cliente ${SUF}`; const Fm = `Forn Misto ${SUF}`;
    const mc = await material({ cliente: clienteId });
    const mp = await material();
    const rc = await receber({ fornecedor_nome: Fc }, [[mc, 10]]);
    await conferir(rc.id, [[rc.itens[0], 8]]);
    assert.deepStrictEqual(await linha(Fc), [], 'fornecedor so com material de cliente apareceu');
    const rm = await receber({ fornecedor_nome: Fm }, [[mp, 10], [mc, 10]]);
    await conferir(rm.id, [[rm.itens[0], 10], [rm.itens[1], 8]]);
    const l = await umaLinha(Fm);
    assert.strictEqual(l.itens_conferidos, 1, JSON.stringify(l));
    assert.strictEqual(l.itens_divergentes, 0, 'a divergencia do item de cliente contou');
  });

  // ══════════════ periodo ══════════════
  await test('[periodo] DIA do recebimento: ontem como fim exclui; data invalida = vazio; sem filtro inclui', async () => {
    const F = `Forn Divergencia ${SUF}`;
    assert.deepStrictEqual(await linha(F, `?data_fim=${ONTEM}`), []);
    assert.deepStrictEqual(await rel('?data_inicio=lixo'), [], 'data invalida devolve vazio (como o historico)');
    assert.strictEqual((await linha(F, '')).length, 1);
    assert.strictEqual((await linha(F, `?data_inicio=${HOJE}`)).length, 1);
  });

  await test('[RN-11] export XLSX com os cabecalhos; pelo SERVICO = rota', async () => {
    setUser({ ...ADMIN });
    const res = await request(app).get(`${URL_REL}/export?data_inicio=${HOJE}&data_fim=${HOJE}`).buffer().parse(binaryParser);
    assert.strictEqual(res.status, 200);
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    assert.strictEqual(linhas[0][0], 'Fornecedor');
    assert.strictEqual(linhas[0][linhas[0].length - 1], '% rejeição');
    const rota = await rel();
    assert.strictEqual(linhas.length - 1, rota.length);
    const svc = await reportService.relatorioQualidadeFornecedores(db, { data_inicio: HOJE, data_fim: HOJE });
    assert.deepStrictEqual(svc, rota);
    assert.ok(rota.some((l) => l.inspecoes > 0 && l.itens_divergentes > 0), 'paridade com linhas vazias provaria nada');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
