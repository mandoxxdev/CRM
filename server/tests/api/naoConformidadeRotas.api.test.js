/**
 * Etapa 43, T2 — as QUATRO portas HTTP da nao conformidade numerada.
 *
 * Plano:  docs/superpowers/plans/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada.md (T2)
 * Design: docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md (D8, RN-09)
 *
 * O servico (T1) ja tem suite propria (`naoConformidadeServico.api.test.js`), que mede a regra.
 * Aqui o alvo e outro e nao se sobrepoe: o que SO a rota pode errar —
 *   - o gate de perfil de cada porta (D8), incluindo quem NAO pode;
 *   - a traducao do `null` de idempotencia em 409 com a mensagem literal;
 *   - o embrulho `{ itens }` de um servico que devolve ARRAY;
 *   - a query chegando inteira ao servico (`status`, `limite`) em vez de ser ignorada em silencio;
 *   - o 404 de `:id` nao numerico, que sem guarda viraria coercao silenciosa do SQLite.
 *
 * ── AS MENSAGENS SAO CONFERIDAS POR TEXTO, NAO SO POR STATUS ─────────────────────────────────
 * Todo cenario de erro usa `assert.strictEqual` no `body.error`. Conferir so o status deixaria
 * passar a rota revalidando o enum por conta propria com outra frase — que e exatamente o modo de
 * falha que o plano proibiu ("duplicar a regua e como a mensagem literal se parte em duas").
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * A listagem afirma PRIMEIRO o que a lista TRAZ e so depois o que ela NAO traz. Uma assercao so
 * de ausencia (`!itens.some(...)`) passa identica com a rota morta, com 404, com filtro que nao
 * casa nada e com a tabela vazia — ja aconteceu tres vezes nesta base.
 *
 * ── CONTROLE POSITIVO (obrigatorio, e ja rodado) ─────────────────────────────────────────────
 * Assercao NEGATIVA de permissao nao fica vermelha na rodada TDD: antes de a acao existir em
 * `ACAO_PERFIS`, `can()` devolve `false` para ela e TODO perfil toma 403 — o cenario da matriz
 * passaria verde provando nada. A unica prova dele e a sabotagem que CONCEDE a permissao
 * proibida: com `decidir_nao_conformidade: [ADMINISTRADOR, QUALIDADE, COMPRAS]` em
 * `permissions.js`, o cenario (7) cai nomeando a acao e o perfil. Medido nesta task.
 *
 * Executar: cd server && node tests/api/naoConformidadeRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const BASE = '/api/almoxarifado/nao-conformidades';

const ADMIN = { id: 430, nome: 'Admin E43', role: 'admin', is_superadmin: 1, email: 'admin43@test.com' };
const ALMOXARIFE = { id: 431, nome: 'Almoxarife E43', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox43@test.com' };
const QUALIDADE = { id: 432, nome: 'Qualidade E43', role: 'usuario', perfil_almoxarifado: 'QUALIDADE', email: 'qual43@test.com' };
const COMPRAS = { id: 433, nome: 'Compras E43', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras43@test.com' };
const ENGENHARIA = { id: 434, nome: 'Engenharia E43', role: 'usuario', perfil_almoxarifado: 'ENGENHARIA', email: 'eng43@test.com' };
const GESTOR = { id: 435, nome: 'Gestor E43', role: 'usuario', perfil_almoxarifado: 'GESTOR', email: 'gestor43@test.com' };
const CONSULTA = { id: 436, nome: 'Consulta E43', role: 'usuario', perfil_almoxarifado: 'CONSULTA', email: 'consulta43@test.com' };
// Sem `perfil_almoxarifado`, sem `role: 'admin'`, sem superadmin => `getPerfilFromUser` cai no
// fallback PRODUCAO. Usuario SEM perfil nao e "sem acesso", e chao de fabrica — e por isso ele
// precisa estar na matriz de proposito, e nao como curiosidade.
const SEM_PERFIL = { id: 437, nome: 'Sem Perfil E43', role: 'usuario', email: 'semperfil43@test.com' };

let seq = 0;
const uniq = (p) => `${p}-${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 43 T2: rotas da nao conformidade numerada ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });

  /** Um recebimento com UM item, quantidades sob controle do cenario. */
  async function novoItem({ esperada = 10, recebida = 7 } = {}) {
    const mat = await dbRun(db, 'INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)',
      [uniq('MAT-T2'), 'Material da T2', 'KG']);
    // A NF sai do fixture como DADO, e nao como `uniq('NF')` anonimo dentro do INSERT: e ela que a
    // linha da listagem tem de devolver, e sem o valor esperado em maos a assercao viraria um
    // `assert.ok(linha.nota_fiscal)` — que passa com qualquer coisa nao vazia.
    const notaFiscal = uniq('NF');
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal) VALUES (?,?,?)`, [uniq('REC-T2'), 'RECEBIDO', notaFiscal]);
    const item = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat.lastID, esperada, recebida]);
    return { materialId: mat.lastID, recebimentoId: rec.lastID, itemId: item.lastID, notaFiscal };
  }

  const corpoDe = (itemId, extra = {}) => ({
    origem: 'RECEBIMENTO',
    referencia_tipo: 'RECEBIMENTO_ITEM',
    referencia_id: itemId,
    tipo: 'CERTIFICADO_AUSENTE',
    ...extra,
  });

  /** Abre uma NC pela porta HTTP, como ADMIN, e devolve o documento. */
  async function abrirPorHttp(extra = {}) {
    const { itemId, materialId, notaFiscal } = await novoItem();
    setUser({ ...ADMIN });
    const r = await request(app).post(BASE).send(corpoDe(itemId, extra));
    assert.strictEqual(r.status, 201, `abertura de fixture falhou: ${r.status} ${JSON.stringify(r.body)}`);
    return { nc: r.body, itemId, materialId, notaFiscal };
  }

  // ── (1) POST: as quatro recusas de forma, com a MENSAGEM LITERAL ──────────────────────────
  await test('(1) POST recusa origem/referencia/tipo/id invalidos com a mensagem literal do contrato', async () => {
    const { itemId } = await novoItem();
    setUser({ ...ADMIN });

    const casos = [
      ['Origem inválida', corpoDe(itemId, { origem: 'XPTO' })],
      ['Tipo de referência inválido', corpoDe(itemId, { referencia_tipo: 'XPTO' })],
      ['Tipo de não conformidade inválido', corpoDe(itemId, { tipo: 'XPTO' })],
      // `Number.isInteger`, nunca `isFinite`: 1.5 viraria 1 no SQLite e penduraria o documento no
      // item errado, em silencio (precedente de anexoService.js).
      ['Referência inválida', corpoDe(itemId, { referencia_id: 1.5 })],
      ['Referência inválida', corpoDe(itemId, { referencia_id: 'abc' })],
    ];
    for (const [mensagem, corpo] of casos) {
      const r = await request(app).post(BASE).send(corpo);
      assert.strictEqual(r.status, 400, `${mensagem}: status ${r.status} (corpo ${JSON.stringify(r.body)})`);
      assert.strictEqual(r.body.error, mensagem,
        `a rota respondeu "${r.body.error}" no lugar de "${mensagem}" — alguem revalidou o enum na rota`);
    }

    // Referencia bem formada que nao existe: 404 do SERVICO, repassado pelo handleError.
    const inexistente = await request(app).post(BASE).send(corpoDe(987654));
    assert.strictEqual(inexistente.status, 404, `item inexistente devolveu ${inexistente.status}`);
    assert.strictEqual(inexistente.body.error, 'Item de recebimento não encontrado');

    // GUARDA: o mesmo corpo, correto, TEM de passar — sem isto os cinco 400 acima passariam
    // identicos com a rota devolvendo 400 para tudo.
    const ok = await request(app).post(BASE).send(corpoDe(itemId));
    assert.strictEqual(ok.status, 201, `o corpo valido devolveu ${ok.status} ${JSON.stringify(ok.body)}`);
    assert.ok(/^NC-/.test(ok.body.numero), `numero fora do padrao: ${ok.body.numero}`);
    assert.strictEqual(ok.body.status, 'ABERTA');
  });

  // ── (2) POST: a idempotencia da RN-08 vira 409 NA ROTA ────────────────────────────────────
  await test('(2) POST: segunda abertura identica vira 409 com a mensagem literal (o `null` do servico)', async () => {
    const { nc, itemId } = await abrirPorHttp();
    assert.ok(nc.id, 'a primeira abertura nao devolveu documento');

    const segunda = await request(app).post(BASE).send(corpoDe(itemId));
    assert.strictEqual(segunda.status, 409,
      `a repeticao devolveu ${segunda.status} ${JSON.stringify(segunda.body)} — o \`null\` do servico nao virou 409`);
    assert.strictEqual(segunda.body.error, 'Já existe uma não conformidade aberta para este item e tipo');

    // E o 409 nao pode ter criado nada: a segunda chamada devolveu `null`, nao um documento novo.
    const total = await dbGet(db, `SELECT COUNT(*) AS n FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?`, [itemId]);
    assert.strictEqual(total.n, 1, `o item ficou com ${total.n} NCs depois do 409`);

    // GUARDA: outro TIPO no MESMO item abre normalmente — o 409 e do par item+tipo, nao do item.
    const outroTipo = await request(app).post(BASE).send(corpoDe(itemId, { tipo: 'DANO_FISICO' }));
    assert.strictEqual(outroTipo.status, 201,
      `outro tipo no mesmo item devolveu ${outroTipo.status} — o 409 esta largo demais`);
  });

  // ── (3) GET /:id ──────────────────────────────────────────────────────────────────────────
  await test('(3) GET /:id devolve o documento; id inexistente e id NAO NUMERICO dao o mesmo 404', async () => {
    const { nc } = await abrirPorHttp();
    setUser({ ...CONSULTA });

    // Positivo primeiro: leitura e so `auth`, entao ate o CONSULTA le.
    const achado = await request(app).get(`${BASE}/${nc.id}`);
    assert.strictEqual(achado.status, 200, `CONSULTA tomou ${achado.status} na leitura — o gate de leitura ficou estreito demais`);
    assert.strictEqual(achado.body.id, nc.id);
    assert.strictEqual(achado.body.numero, nc.numero);

    for (const id of [987654, 'abc', 'NaN', 'Infinity', '1.5']) {
      const r = await request(app).get(`${BASE}/${id}`);
      assert.strictEqual(r.status, 404, `GET /${id} devolveu ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Não conformidade não encontrada',
        `GET /${id} respondeu "${r.body.error}"`);
    }
  });

  // ── (4) GET lista: `{ itens }`, filtro de status e `limite` ───────────────────────────────
  await test('(4) GET lista embrulha em `{ itens }`, filtra por status e respeita `limite` (clamp 500)', async () => {
    const a = await abrirPorHttp({ descricao: 'fica ABERTA' });
    const b = await abrirPorHttp({ descricao: 'vai ser DECIDIDA' });
    setUser({ ...QUALIDADE });
    const dec = await request(app).post(`${BASE}/${b.nc.id}/decidir`)
      .send({ decisao: 'ACEITAR', justificativa: 'lote liberado pela engenharia' });
    assert.strictEqual(dec.status, 200, `a decisao de fixture falhou: ${dec.status} ${JSON.stringify(dec.body)}`);

    setUser({ ...CONSULTA });
    const todas = await request(app).get(BASE);
    assert.strictEqual(todas.status, 200);
    assert.ok(Array.isArray(todas.body.itens),
      `a rota devolveu ${JSON.stringify(Object.keys(todas.body))} — o array do servico nao foi embrulhado em \`{ itens }\``);

    // POSITIVO ANTES DO NEGATIVO: primeiro que o filtro TRAZ o que deve trazer. Uma assercao so
    // de ausencia passaria identica com a rota morta.
    const abertas = await request(app).get(`${BASE}?status=ABERTA`);
    const idsAbertas = abertas.body.itens.map((i) => i.id);
    assert.ok(idsAbertas.includes(a.nc.id), `a NC ABERTA ${a.nc.numero} sumiu de ?status=ABERTA (vieram ${JSON.stringify(idsAbertas)})`);
    assert.ok(idsAbertas.length >= 2, `?status=ABERTA trouxe ${idsAbertas.length} linhas — poucas demais para o filtro estar vivo`);
    assert.ok(!idsAbertas.includes(b.nc.id), `a NC DECIDIDA ${b.nc.numero} apareceu em ?status=ABERTA`);

    const decididas = await request(app).get(`${BASE}?status=DECIDIDA`);
    const idsDecididas = decididas.body.itens.map((i) => i.id);
    assert.ok(idsDecididas.includes(b.nc.id), `a NC DECIDIDA sumiu de ?status=DECIDIDA (vieram ${JSON.stringify(idsDecididas)})`);
    assert.ok(!idsDecididas.includes(a.nc.id), `a NC ABERTA apareceu em ?status=DECIDIDA`);

    // As colunas do LEFT JOIN chegam pela rota, e nao so pelo servico.
    const linha = abertas.body.itens.find((i) => i.id === a.nc.id);
    assert.ok(linha.material_codigo, `material_codigo veio ${JSON.stringify(linha.material_codigo)} pela rota`);
    assert.ok(linha.recebimento_numero, `recebimento_numero veio ${JSON.stringify(linha.recebimento_numero)} pela rota`);
    // `nota_fiscal` estava no SELECT de `CAMPOS_LISTA` e NINGUEM a media: trocar `r.nota_fiscal`
    // por `NULL` no servico nao derrubava nenhum arquivo da suite. E ela e o numero pelo qual o
    // almoxarife acha o papel no arquivo fisico — a coluna que liga o documento ao mundo real.
    // Conferida pelo VALOR do fixture, nao por `assert.ok`: a NF de OUTRO recebimento tambem seria
    // "nao vazia" e passaria por um JOIN errado.
    assert.strictEqual(linha.nota_fiscal, a.notaFiscal,
      `nota_fiscal veio ${JSON.stringify(linha.nota_fiscal)} e o recebimento da NC tem ${JSON.stringify(a.notaFiscal)}`);

    // `limite` CHEGA ao SQL pela rota — provado pelo efeito, com a lista maior que o limite.
    assert.ok(todas.body.itens.length > 2, `so ha ${todas.body.itens.length} NCs: o teste de \`limite\` seria vazio`);
    const limitada = await request(app).get(`${BASE}?limite=2`);
    assert.strictEqual(limitada.body.itens.length, 2,
      `?limite=2 trouxe ${limitada.body.itens.length} — a query nao chegou ao servico (convencao \`limite\`, nunca \`limit\`)`);

    // O CLAMP em 500 na fronteira do SQL, medido NA ROTA: criar 501 documentos provaria o mesmo e
    // custaria segundos. `db.all` e envelopado so durante as tres chamadas abaixo.
    const allOriginal = db.all.bind(db);
    const capturas = [];
    db.all = function capturar(sql, params, cb) {
      if (/nao_conformidades_almoxarifado/.test(String(sql))) capturas.push({ sql, params });
      return allOriginal(sql, params, cb);
    };
    try {
      await request(app).get(`${BASE}?limite=9999`);
      await request(app).get(`${BASE}?limite=7`);
      await request(app).get(BASE);
    } finally {
      db.all = allOriginal;
    }
    assert.strictEqual(capturas.length, 3, `a varredura capturou ${capturas.length} consultas em vez de 3`);
    const limites = capturas.map((c) => c.params[c.params.length - 1]);
    assert.deepStrictEqual(limites, [500, 7, 100],
      `[9999, 7, ausente] tinham de virar [500, 7, 100] na fronteira do SQL; vieram ${JSON.stringify(limites)}`);
    assert.ok(capturas.every((c) => / LIMIT \?/.test(c.sql)), 'o limite foi interpolado no SQL em vez de ir como parametro');
  });

  // ── (5) POST /:id/decidir: as recusas com mensagem literal ────────────────────────────────
  await test('(5) POST /decidir recusa enum, justificativa vazia, NC encerrada e id nao numerico', async () => {
    const { nc } = await abrirPorHttp();
    setUser({ ...QUALIDADE });

    const invalida = await request(app).post(`${BASE}/${nc.id}/decidir`)
      .send({ decisao: 'XPTO', justificativa: 'tem justificativa' });
    assert.strictEqual(invalida.status, 400, `decisao fora do enum devolveu ${invalida.status}`);
    assert.strictEqual(invalida.body.error, 'Decisão inválida');

    for (const justificativa of [undefined, '', '   ']) {
      const r = await request(app).post(`${BASE}/${nc.id}/decidir`).send({ decisao: 'ACEITAR', justificativa });
      assert.strictEqual(r.status, 400, `justificativa ${JSON.stringify(justificativa)} devolveu ${r.status}`);
      assert.strictEqual(r.body.error, 'Justificativa é obrigatória para decidir a não conformidade',
        `justificativa ${JSON.stringify(justificativa)} respondeu "${r.body.error}"`);
    }

    for (const id of [987654, 'abc']) {
      const r = await request(app).post(`${BASE}/${id}/decidir`)
        .send({ decisao: 'ACEITAR', justificativa: 'qualquer' });
      assert.strictEqual(r.status, 404, `decidir /${id} devolveu ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Não conformidade não encontrada');
    }

    // GUARDA: depois de tudo isso a NC continua ABERTA e a decisao BOA passa — sem este positivo
    // os quatro 400/404 acima passariam identicos com a rota quebrada.
    const ok = await request(app).post(`${BASE}/${nc.id}/decidir`)
      .send({ decisao: 'ACEITAR_SOB_DESVIO', justificativa: 'desvio aceito pela engenharia' });
    assert.strictEqual(ok.status, 200, `a decisao valida devolveu ${ok.status} ${JSON.stringify(ok.body)}`);
    assert.strictEqual(ok.body.status, 'DECIDIDA');
    assert.strictEqual(ok.body.decisao, 'ACEITAR_SOB_DESVIO');
    assert.strictEqual(ok.body.decidido_por_nome, QUALIDADE.nome,
      `o autor da decisao veio ${JSON.stringify(ok.body.decidido_por_nome)} — a rota nao passou o \`req.user\``);

    // E a segunda decisao da MESMA NC e 409 (RN-06), nao 200 silencioso.
    const repetida = await request(app).post(`${BASE}/${nc.id}/decidir`)
      .send({ decisao: 'DEVOLVER', justificativa: 'mudei de ideia' });
    assert.strictEqual(repetida.status, 409, `a redecisao devolveu ${repetida.status}`);
    assert.strictEqual(repetida.body.error, 'Esta não conformidade já foi encerrada');
  });

  // ── (6) Matriz de perfis — ABRIR ──────────────────────────────────────────────────────────
  //
  // As listas abaixo sao LITERAIS de proposito, e NAO derivadas de `ACAO_PERFIS`: derivadas, a
  // sabotagem do controle positivo mudaria a expectativa junto com o codigo e o teste ficaria
  // verde provando nada — o cenario seria uma tautologia.
  await test('(6) matriz de `registrar_nao_conformidade`: 4 perfis abrem, 4 tomam 403 (inclusive SEM PERFIL)', async () => {
    const PODEM = [['ADMINISTRADOR', ADMIN], ['ALMOXARIFE', ALMOXARIFE], ['QUALIDADE', QUALIDADE], ['COMPRAS', COMPRAS]];
    const NAO_PODEM = [['PRODUCAO (usuario SEM perfil)', SEM_PERFIL], ['ENGENHARIA', ENGENHARIA],
      ['GESTOR', GESTOR], ['CONSULTA', CONSULTA]];

    for (const [nomePerfil, usuario] of PODEM) {
      const { itemId } = await novoItem();
      setUser({ ...usuario });
      const r = await request(app).post(BASE).send(corpoDe(itemId));
      assert.strictEqual(r.status, 201,
        `perfil ${nomePerfil} NAO conseguiu registrar_nao_conformidade: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.aberto_por_nome, usuario.nome,
        `a NC aberta por ${nomePerfil} ficou com autor ${JSON.stringify(r.body.aberto_por_nome)}`);
    }

    for (const [nomePerfil, usuario] of NAO_PODEM) {
      const { itemId } = await novoItem();
      setUser({ ...usuario });
      const r = await request(app).post(BASE).send(corpoDe(itemId));
      assert.strictEqual(r.status, 403,
        `perfil ${nomePerfil} PASSOU indevidamente em registrar_nao_conformidade (status ${r.status}) — o gate da porta de abrir esta largo demais`);
      assert.strictEqual(r.body.acao, 'registrar_nao_conformidade');
      // E o 403 aconteceu ANTES de escrever: nada foi criado para o item.
      const criadas = await dbGet(db, `SELECT COUNT(*) AS n FROM nao_conformidades_almoxarifado
        WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ?`, [itemId]);
      assert.strictEqual(criadas.n, 0, `${nomePerfil} tomou 403 mas deixou ${criadas.n} NC gravada`);
    }
  });

  // ── (7) Matriz de perfis — DECIDIR (o cenario do CONTROLE POSITIVO) ───────────────────────
  await test('(7) matriz de `decidir_nao_conformidade`: so ADMINISTRADOR e QUALIDADE decidem; os outros 6 tomam 403', async () => {
    const PODEM = [['ADMINISTRADOR', ADMIN], ['QUALIDADE', QUALIDADE]];
    // ALMOXARIFE e COMPRAS estao aqui DE PROPOSITO (D8): os dois ABREM e nenhum dos dois DECIDE.
    // COMPRAS e o caso que a etapa precisa provar — parte interessada no fornecedor sobre o qual
    // decidiria. Este e o par acao+perfil que o controle positivo derruba quando sabotado.
    const NAO_PODEM = [['ALMOXARIFE', ALMOXARIFE], ['COMPRAS', COMPRAS],
      ['PRODUCAO (usuario SEM perfil)', SEM_PERFIL], ['ENGENHARIA', ENGENHARIA],
      ['GESTOR', GESTOR], ['CONSULTA', CONSULTA]];

    for (const [nomePerfil, usuario] of PODEM) {
      const { nc } = await abrirPorHttp();
      setUser({ ...usuario });
      const r = await request(app).post(`${BASE}/${nc.id}/decidir`)
        .send({ decisao: 'DEVOLVER', justificativa: `decidido por ${nomePerfil}` });
      assert.strictEqual(r.status, 200,
        `perfil ${nomePerfil} NAO conseguiu decidir_nao_conformidade: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.status, 'DECIDIDA');
    }

    for (const [nomePerfil, usuario] of NAO_PODEM) {
      const { nc } = await abrirPorHttp();
      setUser({ ...usuario });
      const r = await request(app).post(`${BASE}/${nc.id}/decidir`)
        .send({ decisao: 'ACEITAR', justificativa: `tentativa de ${nomePerfil}` });
      assert.strictEqual(r.status, 403,
        `perfil ${nomePerfil} PASSOU indevidamente em decidir_nao_conformidade (status ${r.status}) — a NC ${nc.numero} foi encerrada por quem nao responde pela qualidade do que entra`);
      assert.strictEqual(r.body.acao, 'decidir_nao_conformidade');
      // O 403 tem de ser ANTES da escrita: a NC continua ABERTA, sem decisao e sem autor.
      const depois = await dbGet(db, 'SELECT status, decisao, decidido_por_id FROM nao_conformidades_almoxarifado WHERE id = ?', [nc.id]);
      assert.strictEqual(depois.status, 'ABERTA',
        `perfil ${nomePerfil} tomou 403 em decidir_nao_conformidade mas a NC ${nc.numero} ficou ${depois.status}`);
      assert.strictEqual(depois.decisao, null, `perfil ${nomePerfil} gravou decisao ${depois.decisao} apesar do 403`);
    }
  });

  // ── (8) `minhas-permissoes` publica as duas acoes novas ───────────────────────────────────
  await test('(8) GET /minhas-permissoes publica as duas acoes novas, com a assimetria do D8', async () => {
    assert.ok(Object.keys(ACAO_PERFIS).includes('registrar_nao_conformidade'),
      'registrar_nao_conformidade nao esta em ACAO_PERFIS — a rota itera Object.keys e a tela nao veria a acao');
    assert.ok(Object.keys(ACAO_PERFIS).includes('decidir_nao_conformidade'),
      'decidir_nao_conformidade nao esta em ACAO_PERFIS');

    setUser({ ...QUALIDADE });
    const q = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(q.status, 200);
    assert.strictEqual(q.body.perfil, 'QUALIDADE');
    assert.strictEqual(q.body.acoes.registrar_nao_conformidade, true,
      'QUALIDADE deveria poder registrar_nao_conformidade');
    assert.strictEqual(q.body.acoes.decidir_nao_conformidade, true,
      'QUALIDADE deveria poder decidir_nao_conformidade');

    setUser({ ...CONSULTA });
    const c = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(c.body.acoes.registrar_nao_conformidade, false,
      'perfil CONSULTA aparece podendo registrar_nao_conformidade');
    assert.strictEqual(c.body.acoes.decidir_nao_conformidade, false,
      'perfil CONSULTA aparece podendo decidir_nao_conformidade');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
