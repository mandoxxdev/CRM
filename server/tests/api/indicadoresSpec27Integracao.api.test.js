/**
 * Etapa 67, Task 5 (integracao, cruza os galhos) — os indicadores da spec 27 ponta a ponta.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa67-indicadores-spec27.md (T5 e a
 * secao "Fase 2 — revisao do plano", que prevalece sobre o texto anterior).
 *
 * T1 (blocos do indicadores + C89 + formato de data_necessidade), T2 (ajustes-por-motivo) e T3
 * (qualidade-fornecedores) foram testados cada um no seu galho. Aqui se prova que as pecas
 * conversam, TUDO PELAS ROTAS HTTP (o banco so e tocado para montar localizacao, material,
 * fornecedor do cadastro, cliente e a config de inspecao de critico):
 *
 *  (1) requisicao com data_necessidade pela rota de criacao (formato invalido -> 400 literal, sem
 *      gravar) -> aprovar -> separar -> entregar parcial -> completar: requisicoes_no_prazo e
 *      requisicoes_integrais andam como a regua diz (prazo hoje = no prazo; prazo ha 2 dias =
 *      atrasada; parcial com prazo de hoje fica em_aberto_no_dia; parcial encerrada = incompleta);
 *      excluir uma entregue tira dos tres blocos de requisicao, inclusive do atendimento (C89).
 *  (2) ajuste com motivo do cadastro + ajuste de texto livre + estorno de um (+ PERDA com motivo e
 *      ajuste de material de cliente como ruido): o bloco ajustes do indicadores, o relatorio
 *      ajustes-por-motivo e o historico grupo=AJUSTE batem NO MESMO RECORTE (as condicoes da nota:
 *      mesmo dia, menos de 500 linhas, sem material de cliente — o historico inclui o de cliente).
 *  (3) recebimento de PEDIDO de compra (fornecedor do cadastro, com CNPJ) -> Finalizar Conferencia
 *      com falta -> /aprovar leva o critico a quarentena -> inspecao reprovando -> o relatorio
 *      qualidade-fornecedores mostra divergencia e rejeicao; um segundo recebimento do MESMO CNPJ
 *      por NF avulsa (sem fornecedor_id, CNPJ pontuado, outro nome) agrupa na MESMA linha.
 *  (4) as duas chaves novas aparecem na lista como exportaveis e o export XLSX responde.
 *
 * "Hoje" vem do SQLite (`date('now')`): a regua dos relatorios e o dia UTC.
 *
 * Executar: cd server && node tests/api/indicadoresSpec27Integracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 675, nome: 'Admin E67T5', role: 'admin', is_superadmin: 1, email: 'e67t5@test.com' };
const APROVADOR = { id: 6751, nome: 'Aprovador E67T5', role: 'admin', is_superadmin: 1, email: 'e67t5b@test.com' };
const FORMATO = 'data_necessidade deve estar no formato AAAA-MM-DD';
const JANELA = 30;
const SUF = `${Date.now() % 100000}`;

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

let seq = 0;

(async () => {
  console.log('\n=== Etapa 67 Task 5: indicadores da spec 27 ponta a ponta (rotas) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const dia = async (n) => (await dbGet(db, 'SELECT date(\'now\', ?) AS d', [`${-n} days`])).d;
  // Etapa 73 (T0, G80 causa 1): HOJE/ONTEM eram lidos UMA vez aqui; a rodada que atravessava a
  // meia-noite UTC derrubava 7 de 8 cenarios (sonda73-g80-virada.js). Agora cada cenario le os seus
  // na entrada (`datas()`), e nao existe mais HOJE/ONTEM neste escopo — esquecer de ler e ReferenceError.
  const datas = async () => ({ HOJE: await dia(0), ONTEM: await dia(1) });
  /** A cadeia [1 parcial] -> [1 completar] -> [1 C89] usa a mesma A com prazo "hoje": se faltar menos
   *  de `margem` segundos para a meia-noite UTC, espera a virada antes de montar A. */
  const esperarViradaSePerto = async (margem = 30) => {
    const { s } = await dbGet(db, "SELECT (julianday(date('now','+1 day')) - julianday('now')) * 86400 AS s");
    if (s < margem) {
      console.log(`  (faltam ${s.toFixed(1)} s para a meia-noite UTC: esperando a virada)`);
      await new Promise((r) => { setTimeout(r, Math.ceil(s + 1) * 1000); });
    }
  };

  const loc = async () => {
    const c = `E67T5-L${++seq}`;
    return (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, c])).lastID;
  };
  const v2 = (body) => { setUser({ ...ADMIN }); return request(app).post('/api/almoxarifado/movimentacoes/v2').send(body); };
  const ok = async (body) => {
    const r = await v2(body);
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  // Material com saldo entrado PELO MOTOR (v2): a entrega da requisicao e o ajuste baixam de verdade.
  const material = async ({ saldo = 100, cliente = null, critico = false } = {}) => {
    const P = await loc();
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id,
       proprietario_cliente_id, material_critico, controle_lote)
      VALUES (?, ?, 'UN', 0, 1, 'ACO', ?, ?, ?, 0)`, [`E67T5-M${++seq}`, `Mat E67T5 ${seq}`, P, cliente, critico ? 1 : 0])).lastID;
    if (saldo > 0) await ok({ material_id: id, tipo: 'ENTRADA', quantidade: saldo, localizacao_destino_id: P, motivo: 'setup' });
    return id;
  };
  const indic = async () => {
    setUser({ ...ADMIN });
    const r = await request(app).get(`/api/almoxarifado/relatorios/indicadores?janela_dias=${JANELA}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const delta = (antes, depois, bloco) => {
    const out = {};
    for (const k of Object.keys(depois[bloco])) {
      if (typeof depois[bloco][k] === 'number' && k !== 'percentual' && k !== 'media_horas') {
        out[k] = depois[bloco][k] - (antes[bloco]?.[k] ?? 0);
      }
    }
    return out;
  };

  // ══════════════ (1) requisicoes: criar -> aprovar -> separar -> entregar parcial -> completar ══════════════
  const criarAprovada = async (itens, dataNecessidade) => {
    setUser({ ...ADMIN });
    const cr = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ itens: itens.map(([material_id, quantidade]) => ({ material_id, quantidade })), data_necessidade: dataNecessidade });
    assert.strictEqual(cr.status, 201, `criar: ${JSON.stringify(cr.body)}`);
    setUser({ ...APROVADOR });
    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${cr.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    setUser({ ...ADMIN });
    const det = await request(app).get(`/api/almoxarifado/requisicoes/${cr.body.id}`);
    assert.strictEqual(det.status, 200);
    assert.strictEqual(det.body.data_necessidade, dataNecessidade, 'a rota de criacao nao gravou o prazo');
    // Etapa 73 (T0, G80 causa 2): o item e achado pelo MATERIAL, nao pela posicao no detalhe.
    // `itens[k]` = o item do k-esimo material pedido — separar e entregar usam este mapa.
    const porMaterial = new Map(det.body.itens.map((i) => [i.material_id, i.id]));
    assert.strictEqual(porMaterial.size, itens.length, `um item por material: ${JSON.stringify(det.body.itens)}`);
    return { id: cr.body.id, itens: itens.map(([materialId]) => porMaterial.get(materialId)) };
  };
  const separar = async (reqId, pares) => {
    setUser({ ...ADMIN });
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separar`)
      .send({ itens_separados: pares.map(([item_id, quantidade_separada]) => ({ item_id, quantidade_separada })) });
    assert.strictEqual(r.status, 200, `separar: ${JSON.stringify(r.body)}`);
  };
  const entregar = async (reqId, pares, statusEsperado) => {
    setUser({ ...ADMIN });
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: pares.map(([item_id, quantidade_atendida]) => ({ item_id, quantidade_atendida })) });
    assert.strictEqual(r.status, 200, `entregar: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.status, statusEsperado, JSON.stringify(r.body));
  };
  /** Dois itens (2 e 3), separados por inteiro; devolve a requisicao pronta para entregar. */
  const separada = async (prazo) => {
    const r = await criarAprovada([[await material(), 2], [await material(), 3]], prazo);
    await separar(r.id, [[r.itens[0], 2], [r.itens[1], 3]]);
    return r;
  };

  const ctx = {};
  await test('[1 formato] criacao com data_necessidade DD/MM/AAAA -> 400 literal e nada gravado', async () => {
    const { HOJE } = await datas();
    const m = await material();
    const n0 = (await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n;
    setUser({ ...ADMIN });
    const r = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ itens: [{ material_id: m, quantidade: 1 }], data_necessidade: HOJE.split('-').reverse().join('/') });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, FORMATO);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n, n0, 'a recusada foi gravada');
  });

  await test('[1 parcial] prazo HOJE parcial -> em_aberto_no_dia; prazo ha 2 dias parcial -> fora_do_prazo; integrais parados', async () => {
    await esperarViradaSePerto();
    const { HOJE } = await datas();
    ctx.base = await indic();
    ctx.A = await separada(HOJE); // prazo hoje: vai fechar no prazo
    ctx.B = await separada(await dia(2)); // prazo vencido: vai fechar atrasada
    ctx.C = await separada(await dia(2)); // prazo vencido: vai ser encerrada incompleta
    await entregar(ctx.A.id, [[ctx.A.itens[0], 2]], 'PARCIALMENTE_ATENDIDA');
    await entregar(ctx.B.id, [[ctx.B.itens[0], 2]], 'PARCIALMENTE_ATENDIDA');
    await entregar(ctx.C.id, [[ctx.C.itens[0], 2]], 'PARCIALMENTE_ATENDIDA');
    const d = await indic();
    assert.deepStrictEqual(delta(ctx.base, d, 'requisicoes_no_prazo'),
      { no_prazo: 0, fora_do_prazo: 2, consideradas: 2, em_aberto_no_dia: 1, sem_data_valida: 0 },
      JSON.stringify(d.requisicoes_no_prazo));
    assert.deepStrictEqual(delta(ctx.base, d, 'requisicoes_integrais'),
      { integrais: 0, encerradas_incompletas: 0, consideradas: 0 }, JSON.stringify(d.requisicoes_integrais));
    assert.strictEqual(d.atendimento_requisicoes.total_consideradas, ctx.base.atendimento_requisicoes.total_consideradas,
      'entrega parcial nao entra no tempo de atendimento');
  });

  await test('[1 completar] A completa no prazo, B completa atrasada, C encerrada incompleta: no_prazo +1, fora +2, integrais +2, incompletas +1', async () => {
    assert.ok(ctx.C, 'guarda: o cenario anterior montou A, B e C');
    await entregar(ctx.A.id, [[ctx.A.itens[1], 3]], 'ENTREGUE');
    await entregar(ctx.B.id, [[ctx.B.itens[1], 3]], 'ENTREGUE');
    setUser({ ...ADMIN });
    const enc = await request(app).put(`/api/almoxarifado/requisicoes/${ctx.C.id}/encerrar`).send({ motivo: 'E67T5' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
    const d = await indic();
    assert.deepStrictEqual(delta(ctx.base, d, 'requisicoes_no_prazo'),
      { no_prazo: 1, fora_do_prazo: 2, consideradas: 3, em_aberto_no_dia: 0, sem_data_valida: 0 },
      `metade positiva (A no prazo) e negativa (B entregue depois do prazo, C incompleta): ${JSON.stringify(d.requisicoes_no_prazo)}`);
    assert.deepStrictEqual(delta(ctx.base, d, 'requisicoes_integrais'),
      { integrais: 2, encerradas_incompletas: 1, consideradas: 3 }, JSON.stringify(d.requisicoes_integrais));
    assert.strictEqual(d.atendimento_requisicoes.total_consideradas - ctx.base.atendimento_requisicoes.total_consideradas, 2,
      `A e B entram no atendimento: ${JSON.stringify(d.atendimento_requisicoes)}`);
    const np = d.requisicoes_no_prazo;
    assert.strictEqual(np.percentual, Number((100 * np.no_prazo / np.consideradas).toFixed(2)));
    ctx.cheio = d;
  });

  await test('[1 C89] excluir A (entregue no prazo) tira dos tres blocos, inclusive do atendimento; B fica', async () => {
    assert.ok(ctx.cheio, 'guarda');
    setUser({ ...ADMIN });
    const del = await request(app).delete(`/api/almoxarifado/requisicoes/${ctx.A.id}`).send({ justificativa: 'E67T5 excluir' });
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));
    const row = await dbGet(db, 'SELECT ativo, data_entrega FROM requisicoes_almoxarifado WHERE id = ?', [ctx.A.id]);
    assert.ok(row.ativo === 0 && row.data_entrega, `premissa do C89: excluida com data_entrega (${JSON.stringify(row)})`);
    const d = await indic();
    assert.strictEqual(d.atendimento_requisicoes.total_consideradas - ctx.cheio.atendimento_requisicoes.total_consideradas, -1,
      `C89: a excluida continuou no atendimento: ${JSON.stringify(d.atendimento_requisicoes)}`);
    assert.deepStrictEqual(delta(ctx.cheio, d, 'requisicoes_no_prazo'),
      { no_prazo: -1, fora_do_prazo: 0, consideradas: -1, em_aberto_no_dia: 0, sem_data_valida: 0 },
      JSON.stringify(d.requisicoes_no_prazo));
    assert.deepStrictEqual(delta(ctx.cheio, d, 'requisicoes_integrais'),
      { integrais: -1, encerradas_incompletas: 0, consideradas: -1 }, JSON.stringify(d.requisicoes_integrais));
  });

  // ══════════════ (2) ajustes: o bloco e o relatorio por motivo no mesmo recorte ══════════════
  await test('[2] motivo do cadastro + texto livre + estorno: bloco ajustes = Σ ajustes-por-motivo = historico proprio', async () => {
    await esperarViradaSePerto(); // antes/depois do recorte no mesmo par de dias
    const { HOJE, ONTEM } = await datas();
    setUser({ ...ADMIN });
    const cad = await request(app).post('/api/almoxarifado/motivos-movimentacao')
      .send({ nome: `Avaria E67T5 ${SUF}`, tipos: ['AJUSTE_NEGATIVO', 'AJUSTE_POSITIVO', 'PERDA'] });
    assert.strictEqual(cad.status, 201, JSON.stringify(cad.body));
    const M = cad.body;
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E67T5')")).lastID;
    const m1 = await material(); const m2 = await material(); const mCli = await material({ cliente: cli });

    const recorte = async () => {
      const ind = await request(app).get('/api/almoxarifado/relatorios/indicadores?janela_dias=1');
      assert.strictEqual(ind.status, 200, JSON.stringify(ind.body));
      const pm = await request(app).get(`/api/almoxarifado/relatorios/ajustes-por-motivo?data_inicio=${ONTEM}&data_fim=${HOJE}`);
      assert.strictEqual(pm.status, 200, JSON.stringify(pm.body));
      const hist = await request(app).get(`/api/almoxarifado/relatorios/historico-movimentacoes?grupo=AJUSTE&data_inicio=${ONTEM}&data_fim=${HOJE}`);
      assert.strictEqual(hist.status, 200, JSON.stringify(hist.body));
      assert.ok(hist.body.length < 500, 'condicao da nota: menos de 500 linhas no historico');
      return { ind: ind.body.ajustes, pm: pm.body, hist: hist.body };
    };
    const antes = await recorte();

    await ok({ material_id: m1, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: M.id, justificativa: 'cadastro' });
    const doCadastro2 = await ok({ material_id: m2, tipo: 'AJUSTE_POSITIVO', quantidade: 2, motivo_id: M.id, justificativa: 'sera estornado' });
    await ok({ material_id: m1, tipo: 'AJUSTE_POSITIVO', quantidade: 1, motivo: M.nome, justificativa: 'texto livre igual ao nome' });
    await ok({ material_id: m1, tipo: 'PERDA', quantidade: 1, motivo_id: M.id, justificativa: 'perda nao e ajuste' });
    await ok({ material_id: mCli, tipo: 'AJUSTE_NEGATIVO', quantidade: 1, motivo_id: M.id, justificativa: 'cliente' });

    const movId = doCadastro2.id || doCadastro2.movimentacao?.id
      || (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'AJUSTE_POSITIVO' ORDER BY id DESC LIMIT 1", [m2])).id;
    setUser({ ...ADMIN });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'E67T5 estorno' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const depois = await recorte();
    const soma = (pm) => pm.reduce((s, l) => s + l.ajustes, 0);
    const linhaDe = (pm, f) => pm.find(f) || { ajustes: 0 };
    // bloco do indicadores: 2 (cadastro de m1 + texto livre); estornado, PERDA e cliente fora
    assert.strictEqual(depois.ind.total - antes.ind.total, 2, `indicadores.ajustes: ${JSON.stringify(depois.ind)}`);
    // relatorio por motivo: os mesmos 2, um em cada balde
    assert.strictEqual(soma(depois.pm) - soma(antes.pm), 2, `ajustes-por-motivo: ${JSON.stringify(depois.pm)}`);
    const cadLinha = linhaDe(depois.pm, (l) => l.origem === 'Cadastro' && l.motivo_id === M.id);
    assert.strictEqual(cadLinha.ajustes, 1, `o estornado ficou na linha do motivo: ${JSON.stringify(cadLinha)}`);
    assert.strictEqual(cadLinha.motivo, M.nome);
    const livre = (pm) => linhaDe(pm, (l) => l.origem === 'Texto livre').ajustes;
    assert.strictEqual(livre(depois.pm) - livre(antes.pm), 1, 'o texto igual ao nome tem de cair em "Sem motivo do cadastro"');
    // historico grupo=AJUSTE: traz o de cliente (a nota declara); sem ele, o mesmo numero
    const novosHist = depois.hist.length - antes.hist.length;
    assert.strictEqual(novosHist, 3, `historico devia ter 3 novos (com o de cliente): ${novosHist}`);
    const propriosHist = depois.hist.filter((l) => l.material_id !== mCli).length
      - antes.hist.filter((l) => l.material_id !== mCli).length;
    // paridade nos totais absolutos do recorte (nao so nos deltas)
    assert.strictEqual(depois.ind.total, soma(depois.pm), `indicadores ${depois.ind.total} x por motivo ${soma(depois.pm)}`);
    assert.strictEqual(propriosHist, 2);
    assert.strictEqual(depois.hist.filter((l) => l.material_id !== mCli).length, depois.ind.total,
      'historico sem o de cliente = bloco ajustes no mesmo recorte');
  });

  // ══════════════ (3) qualidade por fornecedor: pedido + NF avulsa do mesmo CNPJ ══════════════
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico','1')
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
  const CNPJ = `61${SUF.padStart(6, '0')}000155`.slice(0, 14);
  const CNPJ_PONTUADO = `${CNPJ.slice(0, 2)}.${CNPJ.slice(2, 5)}.${CNPJ.slice(5, 8)}/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`;
  const NOME_CADASTRO = `Fornecedor Cadastro E67T5 ${SUF}`;
  const NOME_NF = `Forn NF Avulsa E67T5 ${SUF}`;
  const URL_QF = '/api/almoxarifado/relatorios/qualidade-fornecedores';
  // Etapa 73 (T0): o recorte e lido NA CHAMADA e cobre ontem+hoje — o [3 CNPJ] agrega o recebimento
  // do [3 pedido], que pode ter ficado do outro lado da meia-noite (o fornecedor e unico por SUF).
  const qf = async () => {
    const { HOJE, ONTEM } = await datas();
    setUser({ ...ADMIN });
    const r = await request(app).get(`${URL_QF}?data_inicio=${ONTEM}&data_fim=${HOJE}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const workflow = async (id, acao) => {
    setUser({ ...ADMIN });
    const r = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });
    assert.strictEqual(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`);
  };
  /** Conferencia como a TELA: iniciar -> salvar (conferencia_quantidade = recebida === esperada) -> finalizar. */
  const conferir = async (recId, recebidas) => {
    await workflow(recId, 'iniciar_conferencia');
    setUser({ ...ADMIN });
    const det = await request(app).get(`/api/almoxarifado/recebimentos/${recId}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    const itensRec = det.body.itens;
    assert.strictEqual(itensRec.length, recebidas.length, JSON.stringify(itensRec));
    const itens = itensRec.map((it, i) => ({
      id: it.id, quantidade_recebida: recebidas[i], conferencia_quantidade: recebidas[i] === Number(it.quantidade_esperada),
    }));
    const r = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens });
    assert.strictEqual(r.status, 200, `conferir: ${JSON.stringify(r.body)}`);
    await workflow(recId, 'finalizar_conferencia');
    return itensRec.map((it) => it.id);
  };

  await test('[3 pedido] recebimento de pedido -> Finalizar Conferencia com falta -> quarentena -> inspecao reprova: divergencia e rejeicao na linha do CNPJ', async () => {
    const fid = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES (?, ?, 'ativo')", [NOME_CADASTRO, CNPJ])).lastID;
    const mCrit = await material({ saldo: 0, critico: true });
    setUser({ ...ADMIN });
    const ped = await request(app).post('/api/compras/pedidos')
      .send({ fornecedor_id: fid, status: 'pendente', itens: [{ material_id: mCrit, quantidade: 10, valor_unitario: 5 }] });
    assert.strictEqual(ped.status, 201, `pedido: ${JSON.stringify(ped.body)}`);
    const rec = await request(app).post('/api/almoxarifado/recebimentos').send({
      pedido_compra_id: ped.body.id, nota_fiscal: `NF-E67T5-P-${SUF}`,
      itens: [{ material_id: mCrit, quantidade: 10 }],
    });
    assert.strictEqual(rec.status, 201, `recebimento do pedido: ${JSON.stringify(rec.body)}`);
    const cab = await dbGet(db, 'SELECT tipo_recebimento, fornecedor_id, fornecedor_cnpj, fornecedor_nome FROM recebimentos_material_almoxarifado WHERE id = ?', [rec.body.id]);
    assert.strictEqual(cab.tipo_recebimento, 'PEDIDO_COMPRA', JSON.stringify(cab));
    assert.strictEqual(cab.fornecedor_id, fid, 'premissa: o pedido grava fornecedor_id');
    const [itemId] = await conferir(rec.body.id, [8]);
    setUser({ ...ADMIN });
    const ap = await request(app).post(`/api/almoxarifado/recebimentos/${rec.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    const retido = await dbGet(db, 'SELECT quantidade_em_inspecao FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(retido.quantidade_em_inspecao, 8, `premissa: o critico ficou em quarentena (${JSON.stringify(retido)})`);
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 5, quantidade_reprovada: 3, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(insp.status, 201, `inspecionar: ${JSON.stringify(insp.body)}`);

    const ls = (await qf()).filter((l) => l.fornecedor === NOME_CADASTRO);
    assert.strictEqual(ls.length, 1, JSON.stringify(ls));
    const l = ls[0];
    assert.deepStrictEqual(
      [l.recebimentos, l.itens_conferidos, l.itens_divergentes, l.itens_com_falta, l.itens_com_sobra,
        l.percentual_divergencia, l.inspecoes, l.inspecoes_com_reprovacao, l.indice_rejeicao],
      [1, 1, 1, 1, 0, 100, 1, 1, 100], JSON.stringify(l));
    ctx.fid = fid;
  });

  await test('[3 CNPJ] NF avulsa do MESMO CNPJ (pontuado, sem fornecedor_id, outro nome) agrupa na mesma linha', async () => {
    assert.ok(ctx.fid, 'guarda: o recebimento do pedido existe');
    const m = await material({ saldo: 0 });
    setUser({ ...ADMIN });
    const rec = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-E67T5-A-${SUF}`,
      fornecedor_nome: NOME_NF, fornecedor_cnpj: CNPJ_PONTUADO,
      itens: [{ material_id: m, quantidade: 4 }],
    });
    assert.strictEqual(rec.status, 201, `NF avulsa: ${JSON.stringify(rec.body)}`);
    const cab = await dbGet(db, 'SELECT tipo_recebimento, fornecedor_id FROM recebimentos_material_almoxarifado WHERE id = ?', [rec.body.id]);
    assert.strictEqual(cab.tipo_recebimento, 'NOTA_FISCAL');
    assert.strictEqual(cab.fornecedor_id, null, 'premissa: a NF avulsa nao grava fornecedor_id');
    await conferir(rec.body.id, [4]);

    const linhas = await qf();
    assert.deepStrictEqual(linhas.filter((x) => x.fornecedor === NOME_CADASTRO), [],
      `o mesmo CNPJ partiu em duas linhas: ${JSON.stringify(linhas.filter((x) => /E67T5/.test(x.fornecedor)))}`);
    const ls = linhas.filter((x) => x.fornecedor === NOME_NF);
    assert.strictEqual(ls.length, 1, `nome exibido = o do recebimento mais recente: ${JSON.stringify(linhas)}`);
    const l = ls[0];
    assert.deepStrictEqual(
      [l.recebimentos, l.itens_conferidos, l.itens_divergentes, l.itens_com_falta,
        l.percentual_divergencia, l.inspecoes, l.inspecoes_com_reprovacao, l.indice_rejeicao],
      [2, 2, 1, 1, 50, 1, 1, 100], JSON.stringify(l));
  });

  // ══════════════ (4) export das duas chaves novas ══════════════
  await test('[4] lista: as duas chaves novas exportaveis; export XLSX responde com os cabecalhos', async () => {
    const { HOJE, ONTEM } = await datas();
    setUser({ ...ADMIN });
    const lista = await request(app).get('/api/almoxarifado/relatorios');
    assert.strictEqual(lista.status, 200);
    for (const [tipo, primeiro, qs, minLinhas] of [
      ['ajustes-por-motivo', 'Origem', `?data_inicio=${ONTEM}&data_fim=${HOJE}`, 2],
      ['qualidade-fornecedores', 'Fornecedor', `?data_inicio=${ONTEM}&data_fim=${HOJE}`, 1],
    ]) {
      const e = lista.body.relatorios.find((r) => r.tipo === tipo);
      assert.ok(e, `${tipo} fora da lista`);
      assert.strictEqual(e.exportavel, true, `${tipo} nao exportavel`);
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(`/api/almoxarifado/relatorios/${tipo}/export${qs}`).buffer().parse(binaryParser);
      assert.strictEqual(res.status, 200, `${tipo}/export: ${res.status} ${String(res.body).slice(0, 200)}`);
      const wb = XLSX.read(res.body, { type: 'buffer' });
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      assert.deepStrictEqual(linhas[0], e.colunas.map((c) => c.rotulo), `${tipo}: cabecalhos`);
      assert.strictEqual(linhas[0][0], primeiro);
      assert.ok(linhas.length - 1 >= minLinhas, `${tipo}: export sem as linhas do cenario (${linhas.length - 1})`);
    }
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
