/**
 * Etapa 27, Task 2 — o PLANO DE INSPECAO do material (CRUD).
 *
 * Plano:  docs/superpowers/plans/2026-08-29-almoxarifado-etapa27-plano-de-inspecao.md (C2, C4)
 * Design: docs/superpowers/specs/2026-08-29-almoxarifado-etapa27-plano-de-inspecao-design.md
 *
 * Prova a RN-01 (plano por material, com N caracteristicas: criar / listar / editar / desativar),
 * o gate `gerenciar_plano_inspecao` com MATRIZ DE PERFIS e a assercao negativa, a listagem
 * FILTRADA por material, a caracteristica duplicada recusada pelo BANCO, o desvio invertido
 * recusado e o `material_id` inexistente devolvendo 404.
 *
 * ── O MOLDE E O DE CATEGORIAS (Etapa 26), NAO O DE FAMILIAS ──────────────────────────────────
 * Mesmo `auditar(...)`/`autorDe(req)`, mesmo soft delete `WHERE id = ? AND ativo = 1` (404 para
 * inexistente, 200 `ja_inativo` idempotente SEM auditar — licao da Etapa 23), mesma colisao
 * detectada PELO BANCO via indice unico (extended.js:200 explica que SELECT-antes-do-INSERT tem
 * janela de corrida) e mesmo preserve-when-omitted no `ativo` do PUT.
 *
 * TRES coisas que o molde NAO cobre, porque plano e FILHO DE UM MATERIAL e nao catalogo global,
 * e por isso cada uma tem cenario proprio aqui:
 *   1. o GET exige `?material_id=N` — sem filtro, a tela de um material mostraria o plano de
 *      todos os outros;
 *   2. o `material_id` e VALIDADO em codigo (404). A FK nao segura no harness — ele roda com
 *      `PRAGMA foreign_keys = 0` e producao com `1` —, entao um material fantasma passaria no
 *      teste e falharia em producao. A validacao em codigo e a unica regua portavel;
 *   3. o indice unico e COMPOSTO e PARCIAL: `(material_id, caracteristica) WHERE ativo = 1`.
 *      Por isso o cenario da duplicada tem dois irmaos — a MESMA caracteristica em OUTRO material
 *      PASSA (senao o indice seria global) e, depois de desativada, PODE ser recriada.
 *
 * ── GUARDA ANTI-TESTE-VAZIO ──────────────────────────────────────────────────────────────────
 * "O plano do material A nao aparece no B" passaria identico se a criacao tivesse falhado, se o
 * GET devolvesse sempre lista vazia ou se a rota nem existisse. Por isso o cenario afirma
 * PRIMEIRO que HA plano no A, no MESMO endpoint e com o MESMO filtro, e so depois que nao ha no B.
 * A matriz de perfis tem a armadilha simetrica: matriz que so afirma 403 passa com a rota morta —
 * por isso ela afirma tambem que os TRES perfis autorizados escrevem, e o vermelho NOMEIA o
 * perfil que passou indevidamente.
 *
 * Executar: cd server && node tests/api/planoInspecao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 27, nome: 'Admin Etapa27', role: 'admin', is_superadmin: 1, email: 'e27@test.com' };

// Os TRES perfis que a acao nova concede (C4): quem MEDE (qualidade), quem ESPECIFICA a
// tolerancia (engenharia) e o administrador.
const PERFIS_COM_ACAO = [
  ['QUALIDADE', { id: 271, nome: 'Qualidade', perfil_almoxarifado: 'QUALIDADE' }],
  ['ENGENHARIA', { id: 272, nome: 'Engenharia', perfil_almoxarifado: 'ENGENHARIA' }],
];

// Os CINCO que nao tem. ALMOXARIFE esta aqui DE PROPOSITO e e o mais importante da lista: ele
// tem `inspecionar` desde sempre e e o candidato obvio a "deveria poder cadastrar tambem".
// Cadastrar a tolerancia e ato de ENGENHARIA/QUALIDADE — quem recebe o material nao define o
// criterio pelo qual ele proprio sera julgado.
const PERFIS_SEM_ACAO = [
  ['ALMOXARIFE', { id: 273, nome: 'Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' }],
  ['GESTOR', { id: 274, nome: 'Gestor', perfil_almoxarifado: 'GESTOR' }],
  ['COMPRAS', { id: 275, nome: 'Compras', perfil_almoxarifado: 'COMPRAS' }],
  ['CONSULTA', { id: 276, nome: 'Consulta', perfil_almoxarifado: 'CONSULTA' }],
  ['PRODUCAO (sem perfil — fallback)', { id: 277, nome: 'Chao de Fabrica' }],
];

let seq = 0;
const uniq = (p) => `${p} ${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 27 Task 2: plano de inspecao (CRUD) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  const ROTA = '/api/almoxarifado/planos-inspecao';
  const listar = (query) => request(app).get(ROTA).query(query);
  const criar = (body) => request(app).post(ROTA).send(body);
  const caracteristicasDe = (res) => res.body.map((p) => p.caracteristica);

  // ── Setup: dois materiais reais (A e B) ────────────────────────────────────────────────────
  const fam = await request(app).post('/api/almoxarifado/familias').send({ nome: uniq('Fam E27') });
  assert.strictEqual(fam.status, 201, `setup da familia falhou: ${fam.status} ${JSON.stringify(fam.body)}`);
  const novoMaterial = async (rotulo) => {
    const codigo = uniq(`MAT-E27-${rotulo}`).replace(/\s+/g, '-');
    const r = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo, nome: `Material ${codigo}`, unidade: 'UN', familia_id: fam.body.id });
    assert.strictEqual(r.status, 201, `setup do material ${rotulo} falhou: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const MAT_A = await novoMaterial('A');
  const MAT_B = await novoMaterial('B');

  // ── A acao nova, antes de qualquer rota ────────────────────────────────────────────────────
  await test('(1) `gerenciar_plano_inspecao` e acao PROPRIA, e nao e o `configurar`', async () => {
    assert.ok(ACAO_PERFIS.gerenciar_plano_inspecao,
      'a acao nao foi declarada em ACAO_PERFIS — o gate estaria caindo em `|| []`, que nega tudo');
    assert.deepStrictEqual([...ACAO_PERFIS.gerenciar_plano_inspecao].sort(),
      ['ADMINISTRADOR', 'ENGENHARIA', 'QUALIDADE'],
      `lista errada: ${JSON.stringify(ACAO_PERFIS.gerenciar_plano_inspecao)}`);
    // A razao de nao reusar `configurar`: ele e [ADMINISTRADOR] sozinho. Reusa-lo deixaria a
    // QUALIDADE sem poder cadastrar o que ela mesma vai medir.
    assert.deepStrictEqual([...ACAO_PERFIS.configurar], ['ADMINISTRADOR'],
      '`configurar` mudou — a justificativa da acao propria precisa ser relida');
    assert.ok(!can({ perfil_almoxarifado: 'QUALIDADE' }, 'configurar'),
      'QUALIDADE passou a ter `configurar`: a acao nova perdeu o motivo de existir');
    assert.ok(can({ perfil_almoxarifado: 'QUALIDADE' }, 'gerenciar_plano_inspecao'),
      'QUALIDADE nao tem a acao nova');
  });

  await test('(2) GET /minhas-permissoes publica a acao nova (a UI barra antes do formulario)', async () => {
    // As duas leituras acontecem ANTES de qualquer assercao e o usuario volta a ser ADMIN antes
    // do primeiro `assert`: uma assercao que lanca no meio deixaria o harness logado como
    // QUALIDADE e derrubaria o SETUP dos cenarios seguintes (`criar_material` e 403 para ela),
    // trocando "a rota nao existe" por "403 no setup" — vermelho pelo motivo errado.
    setUser({ perfil_almoxarifado: 'QUALIDADE', id: 271, nome: 'Qualidade' });
    const r = await request(app).get('/api/almoxarifado/minhas-permissoes');
    setUser({ perfil_almoxarifado: 'ALMOXARIFE', id: 273, nome: 'Almoxarife' });
    const r2 = await request(app).get('/api/almoxarifado/minhas-permissoes');
    setUser({ ...ADMIN });

    assert.strictEqual(r.status, 200, `falhou: ${r.status}`);
    assert.strictEqual(r.body.acoes?.gerenciar_plano_inspecao, true,
      `QUALIDADE deveria ver true: ${JSON.stringify(r.body.acoes)}`);
    assert.strictEqual(r2.body.acoes?.gerenciar_plano_inspecao, false,
      `ALMOXARIFE deveria ver false: ${JSON.stringify(r2.body.acoes)}`);
  });

  // ── RN-01: criar ───────────────────────────────────────────────────────────────────────────
  await test('(3) RN-01 criar: POST 201 e a caracteristica passa a aparecer no GET do material', async () => {
    const caracteristica = uniq('Diametro externo');
    const antes = await listar({ material_id: MAT_A });
    assert.strictEqual(antes.status, 200, `GET antes falhou: ${antes.status} ${JSON.stringify(antes.body)}`);
    assert.ok(Array.isArray(antes.body), `GET nao devolveu array: ${JSON.stringify(antes.body)}`);
    assert.ok(!caracteristicasDe(antes).includes(caracteristica), 'nao pode existir antes de ser criada');

    const res = await criar({
      material_id: MAT_A, caracteristica, unidade: 'mm',
      valor_nominal: 12.3, desvio_inferior: -0.1, desvio_superior: 0.1,
    });
    assert.strictEqual(res.status, 201, `POST falhou: ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, `corpo do 201 sem id: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.ativo, 1, `plano novo nasce ativo: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.material_id, MAT_A, `material_id errado: ${JSON.stringify(res.body)}`);

    const gravado = await dbGet(db, 'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [res.body.id]);
    assert.ok(gravado, `a linha ${res.body.id} nao esta no banco`);
    assert.strictEqual(gravado.valor_nominal, 12.3, `valor_nominal gravado: ${gravado.valor_nominal}`);
    assert.strictEqual(gravado.desvio_inferior, -0.1,
      `desvio_inferior gravado ${gravado.desvio_inferior} — os desvios sao COM SINAL, nao magnitudes`);
    assert.strictEqual(gravado.desvio_superior, 0.1, `desvio_superior gravado: ${gravado.desvio_superior}`);
    assert.strictEqual(gravado.unidade, 'mm', `unidade gravada: ${gravado.unidade}`);

    const depois = await listar({ material_id: MAT_A });
    assert.ok(caracteristicasDe(depois).includes(caracteristica),
      `a caracteristica criada nao aparece no GET: ${JSON.stringify(caracteristicasDe(depois))}`);
  });

  await test('(4) RN-01: N caracteristicas por material, devolvidas ORDER BY caracteristica', async () => {
    const mat = await novoMaterial('Ordem');
    for (const c of ['Zeta largura', 'Alfa diametro', 'Meio espessura']) {
      const r = await criar({ material_id: mat, caracteristica: c, valor_nominal: 10, desvio_inferior: -1, desvio_superior: 1 });
      assert.strictEqual(r.status, 201, `POST de "${c}" falhou: ${r.status} ${JSON.stringify(r.body)}`);
    }
    const res = await listar({ material_id: mat });
    assert.deepStrictEqual(caracteristicasDe(res), ['Alfa diametro', 'Meio espessura', 'Zeta largura'],
      `ordem errada: ${JSON.stringify(caracteristicasDe(res))}`);
  });

  await test('(5) tolerancia UNILATERAL deslocada e representavel (ISO 286: +0,005 / +0,021)', async () => {
    const mat = await novoMaterial('ISO286');
    const res = await criar({
      material_id: mat, caracteristica: 'Eixo h7', unidade: 'mm',
      valor_nominal: 20, desvio_inferior: 0.005, desvio_superior: 0.021,
    });
    assert.strictEqual(res.status, 201,
      `os DOIS desvios acima do nominal foram recusados (${res.status} ${JSON.stringify(res.body)}) — `
      + 'com magnitudes nao-negativas este plano seria inexprimivel, e e o caso normal de ajuste');
    const g = await dbGet(db, 'SELECT desvio_inferior, desvio_superior FROM planos_inspecao_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(g.desvio_inferior, 0.005, `desvio_inferior perdeu o sinal/valor: ${g.desvio_inferior}`);
    assert.strictEqual(g.desvio_superior, 0.021, `desvio_superior: ${g.desvio_superior}`);
  });

  // ── Validacoes do POST ─────────────────────────────────────────────────────────────────────
  await test('(6) caracteristica vazia e 400; valor_nominal ausente ou nao numerico e 400', async () => {
    for (const vazio of ['', '   ', undefined]) {
      const r = await criar({ material_id: MAT_A, caracteristica: vazio, valor_nominal: 1 });
      assert.strictEqual(r.status, 400, `caracteristica ${JSON.stringify(vazio)} deu ${r.status}`);
      assert.strictEqual(r.body.error, 'Característica é obrigatória', `mensagem: ${JSON.stringify(r.body)}`);
    }
    for (const ruim of [undefined, null, '', 'abc', '12,4']) {
      const r = await criar({ material_id: MAT_A, caracteristica: uniq('Nominal ruim'), valor_nominal: ruim });
      assert.strictEqual(r.status, 400,
        `valor_nominal ${JSON.stringify(ruim)} deu ${r.status} — "12,4" e NaN e viraria plano sem faixa`);
      assert.strictEqual(r.body.error, 'Valor nominal é obrigatório', `mensagem: ${JSON.stringify(r.body)}`);
    }
    // Nominal ZERO e legitimo (medida de folga/desvio de forma): nao pode cair no falsy.
    const zero = await criar({ material_id: MAT_A, caracteristica: uniq('Batimento'), valor_nominal: 0, desvio_superior: 0.02 });
    assert.strictEqual(zero.status, 201,
      `valor_nominal 0 recusado (${zero.status} ${JSON.stringify(zero.body)}) — a checagem esta usando falsy`);
  });

  await test('(7) desvio inferior MAIOR que o superior e 400 com a mensagem literal, e nao grava', async () => {
    const caracteristica = uniq('Faixa invertida');
    const antes = (await dbAll(db, 'SELECT id FROM planos_inspecao_almoxarifado')).length;
    const r = await criar({
      material_id: MAT_A, caracteristica, valor_nominal: 10,
      desvio_inferior: 0.5, desvio_superior: -0.5,
    });
    assert.strictEqual(r.status, 400,
      `faixa invertida aceita (${r.status}): avaliarMedida devolveria FAIXA_INVALIDA e TODA peca reprovaria`);
    assert.strictEqual(r.body.error, 'O desvio inferior não pode ser maior que o superior',
      `mensagem: ${JSON.stringify(r.body)}`);
    const depois = (await dbAll(db, 'SELECT id FROM planos_inspecao_almoxarifado')).length;
    assert.strictEqual(depois, antes, `gravou apesar do 400: ${antes} -> ${depois} linhas`);

    // inf === sup e faixa de LARGURA ZERO, valida (medida tem de bater exatamente o nominal).
    const iguais = await criar({ material_id: MAT_A, caracteristica: uniq('Faixa zero'), valor_nominal: 5, desvio_inferior: 0, desvio_superior: 0 });
    assert.strictEqual(iguais.status, 201, `inf === sup recusado (${iguais.status}) — a regua e <=, nao <`);
  });

  await test('(8) material_id inexistente e 404 (a FK NAO segura: o harness roda foreign_keys = 0)', async () => {
    const fk = await dbGet(db, 'PRAGMA foreign_keys');
    assert.strictEqual(Number(fk.foreign_keys), 0,
      'o harness passou a ligar foreign_keys — este cenario deixou de provar o que diz provar');

    const r = await criar({ material_id: 999888, caracteristica: uniq('Fantasma'), valor_nominal: 1 });
    assert.strictEqual(r.status, 404,
      `material fantasma aceito (${r.status} ${JSON.stringify(r.body)}) — passaria no teste e falharia em producao`);
    assert.strictEqual(r.body.error, 'Material não encontrado', `mensagem: ${JSON.stringify(r.body)}`);
    const orfao = await dbGet(db, 'SELECT id FROM planos_inspecao_almoxarifado WHERE material_id = 999888');
    assert.ok(!orfao, `gravou plano orfao id ${orfao?.id}`);

    const semMaterial = await criar({ caracteristica: uniq('Sem pai'), valor_nominal: 1 });
    assert.strictEqual(semMaterial.status, 400, `material_id ausente deu ${semMaterial.status}`);
  });

  // ── Listar por material — o cenario com a guarda anti-teste-vazio ──────────────────────────
  await test('(9) o GET e FILTRADO por material: o plano do A NAO aparece no B', async () => {
    const caracteristica = uniq('So do A');
    const criada = await criar({ material_id: MAT_A, caracteristica, valor_nominal: 8, desvio_inferior: -0.2, desvio_superior: 0.2 });
    assert.strictEqual(criada.status, 201, `setup falhou: ${criada.status} ${JSON.stringify(criada.body)}`);

    // GUARDA: afirmar que HA plano no A ANTES de afirmar que nao ha no B. Sem isto, "o B veio
    // vazio" passaria identico com o POST quebrado, com o GET sempre vazio ou com a rota morta.
    const doA = await listar({ material_id: MAT_A });
    assert.strictEqual(doA.status, 200, `GET do A falhou: ${doA.status}`);
    assert.ok(doA.body.length > 0, 'o material A esta sem plano nenhum — o cenario abaixo mediria zero contra zero');
    assert.ok(caracteristicasDe(doA).includes(caracteristica),
      `a caracteristica do A sumiu: ${JSON.stringify(caracteristicasDe(doA))}`);
    assert.ok(doA.body.every((p) => p.material_id === MAT_A),
      `o GET do A trouxe plano de outro material: ${JSON.stringify(doA.body.map((p) => p.material_id))}`);

    const doB = await listar({ material_id: MAT_B });
    assert.strictEqual(doB.status, 200, `GET do B falhou: ${doB.status}`);
    assert.ok(!caracteristicasDe(doB).includes(caracteristica),
      `"${caracteristica}" apareceu no plano do material B: ${JSON.stringify(caracteristicasDe(doB))} — `
      + 'sem o filtro por material, a tela de cada material mostraria o plano de todos');
  });

  await test('(10) GET sem material_id e 400 — nao devolve o plano do mundo inteiro', async () => {
    const r = await listar({});
    assert.strictEqual(r.status, 400,
      `GET sem filtro devolveu ${r.status} com ${Array.isArray(r.body) ? r.body.length : '?'} itens — `
      + 'plano e filho de um material, listar tudo nao tem leitor e vaza cadastro alheio');
  });

  // ── Duplicada: o indice unico COMPOSTO e PARCIAL ───────────────────────────────────────────
  await test('(11) a MESMA caracteristica duas vezes no MESMO material e 400 (colisao vista pelo BANCO)', async () => {
    const caracteristica = uniq('Diametro repetido');
    const primeira = await criar({ material_id: MAT_A, caracteristica, valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1 });
    assert.strictEqual(primeira.status, 201, `a 1a criacao precisa passar: ${primeira.status}`);

    const segunda = await criar({ material_id: MAT_A, caracteristica, valor_nominal: 99, desvio_inferior: -1, desvio_superior: 1 });
    assert.strictEqual(segunda.status, 400,
      `duplicada aceita (${segunda.status}) — sem o UNIQUE (material_id, caracteristica) o material teria `
      + `dois "${caracteristica}" com nominais diferentes e o payload de medidas ficaria ambiguo`);
    assert.strictEqual(segunda.body.error, 'Já existe esta característica no plano deste material',
      `mensagem: ${JSON.stringify(segunda.body)}`);

    const comEspaco = await criar({ material_id: MAT_A, caracteristica: `  ${caracteristica} `, valor_nominal: 3 });
    assert.strictEqual(comEspaco.status, 400,
      `" ${caracteristica} " passou (${comEspaco.status}) — sem trim antes do INSERT a lista ganha duplicatas visuais`);

    const linhas = await dbAll(db,
      'SELECT id FROM planos_inspecao_almoxarifado WHERE material_id = ? AND caracteristica = ?', [MAT_A, caracteristica]);
    assert.strictEqual(linhas.length, 1, `${linhas.length} linhas com a mesma caracteristica no mesmo material`);
  });

  await test('(12) o indice e COMPOSTO: a mesma caracteristica em OUTRO material passa', async () => {
    const caracteristica = uniq('Diametro externo compartilhado');
    const a = await criar({ material_id: MAT_A, caracteristica, valor_nominal: 10, desvio_inferior: -0.1, desvio_superior: 0.1 });
    assert.strictEqual(a.status, 201, `setup falhou: ${a.status} ${JSON.stringify(a.body)}`);
    const b = await criar({ material_id: MAT_B, caracteristica, valor_nominal: 40, desvio_inferior: -0.5, desvio_superior: 0.5 });
    assert.strictEqual(b.status, 201,
      `"${caracteristica}" recusada no material B (${b.status} ${JSON.stringify(b.body)}) — o indice esta `
      + 'unico so na caracteristica: "Diametro externo" existiria uma vez no sistema INTEIRO');
  });

  await test('(13) o indice e PARCIAL (WHERE ativo = 1): depois de desativada, a caracteristica pode voltar', async () => {
    const mat = await novoMaterial('Parcial');
    const caracteristica = uniq('Espessura');
    const primeira = await criar({ material_id: mat, caracteristica, valor_nominal: 3, desvio_inferior: -0.05, desvio_superior: 0.05 });
    assert.strictEqual(primeira.status, 201, `setup falhou: ${primeira.status}`);
    const del = await request(app).delete(`${ROTA}/${primeira.body.id}`);
    assert.strictEqual(del.status, 200, `DELETE falhou: ${del.status}`);

    const recriada = await criar({ material_id: mat, caracteristica, valor_nominal: 3.5, desvio_inferior: -0.02, desvio_superior: 0.02 });
    assert.strictEqual(recriada.status, 201,
      `recriar depois de desativar deu ${recriada.status} ${JSON.stringify(recriada.body)} — com indice TOTAL o `
      + 'soft delete tranca a caracteristica para sempre e o usuario nao tem como corrigir um cadastro errado');
    assert.notStrictEqual(recriada.body.id, primeira.body.id, 'a linha antiga foi reaproveitada');
  });

  // ── RN-01: editar ──────────────────────────────────────────────────────────────────────────
  await test('(14) RN-01 editar: PUT muda nominal e desvios, e o GET mostra os novos', async () => {
    const mat = await novoMaterial('Edicao');
    const criada = await criar({ material_id: mat, caracteristica: uniq('Comprimento'), valor_nominal: 100, desvio_inferior: -1, desvio_superior: 1 });
    assert.strictEqual(criada.status, 201, `setup falhou: ${criada.status}`);

    const res = await request(app).put(`${ROTA}/${criada.body.id}`)
      .send({ valor_nominal: 101.5, desvio_inferior: -0.25, desvio_superior: 0.75, unidade: 'mm' });
    assert.strictEqual(res.status, 200, `PUT falhou: ${res.status} ${JSON.stringify(res.body)}`);

    const lido = (await listar({ material_id: mat })).body.find((p) => p.id === criada.body.id);
    assert.ok(lido, 'o plano sumiu do GET depois do PUT');
    assert.strictEqual(lido.valor_nominal, 101.5, `valor_nominal: ${lido.valor_nominal}`);
    assert.strictEqual(lido.desvio_inferior, -0.25, `desvio_inferior: ${lido.desvio_inferior}`);
    assert.strictEqual(lido.desvio_superior, 0.75, `desvio_superior: ${lido.desvio_superior}`);
    assert.strictEqual(lido.unidade, 'mm', `unidade: ${lido.unidade}`);
  });

  await test('(15) PUT: id inexistente e 404; faixa invertida e duplicada sao 400 e NAO gravam', async () => {
    const fantasma = await request(app).put(`${ROTA}/999888`).send({ valor_nominal: 1 });
    assert.strictEqual(fantasma.status, 404, `esperava 404, veio ${fantasma.status} ${JSON.stringify(fantasma.body)}`);
    assert.strictEqual(fantasma.body.error, 'Característica não encontrada', `mensagem: ${JSON.stringify(fantasma.body)}`);

    const mat = await novoMaterial('PutRuim');
    const ocupada = uniq('Ja existe');
    await criar({ material_id: mat, caracteristica: ocupada, valor_nominal: 1 });
    const minha = await criar({ material_id: mat, caracteristica: uniq('Minha'), valor_nominal: 10, desvio_inferior: -1, desvio_superior: 1 });
    assert.strictEqual(minha.status, 201, `setup falhou: ${minha.status}`);

    const invertida = await request(app).put(`${ROTA}/${minha.body.id}`).send({ desvio_inferior: 2 });
    assert.strictEqual(invertida.status, 400,
      `PUT com desvio_inferior 2 sobre desvio_superior 1 deu ${invertida.status} — a regua do POST tem de valer `
      + 'no PUT, senao a faixa invalida entra pela porta dos fundos');
    assert.strictEqual(invertida.body.error, 'O desvio inferior não pode ser maior que o superior',
      `mensagem: ${JSON.stringify(invertida.body)}`);

    const colide = await request(app).put(`${ROTA}/${minha.body.id}`).send({ caracteristica: ocupada });
    assert.strictEqual(colide.status, 400, `renomear para caracteristica ocupada passou (${colide.status})`);

    const ainda = await dbGet(db, 'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [minha.body.id]);
    assert.strictEqual(ainda.desvio_inferior, -1, `o desvio mudou apesar do 400: ${ainda.desvio_inferior}`);
    assert.strictEqual(ainda.caracteristica, minha.body.caracteristica, `a caracteristica mudou apesar do 400: ${ainda.caracteristica}`);
  });

  await test('(16) PUT preserve-when-omitted: omitir `ativo` NAO ressuscita um plano desativado', async () => {
    const mat = await novoMaterial('Preserve');
    const criada = await criar({ material_id: mat, caracteristica: uniq('Dureza'), valor_nominal: 200, desvio_inferior: -10, desvio_superior: 10 });
    await request(app).delete(`${ROTA}/${criada.body.id}`);
    const inativo = await dbGet(db, 'SELECT ativo FROM planos_inspecao_almoxarifado WHERE id = ?', [criada.body.id]);
    assert.strictEqual(inativo.ativo, 0, 'guarda: tinha de estar inativo antes do PUT');

    const res = await request(app).put(`${ROTA}/${criada.body.id}`).send({ valor_nominal: 210 });
    assert.strictEqual(res.status, 200, `PUT falhou: ${res.status} ${JSON.stringify(res.body)}`);
    const depois = await dbGet(db, 'SELECT ativo, valor_nominal FROM planos_inspecao_almoxarifado WHERE id = ?', [criada.body.id]);
    assert.strictEqual(depois.ativo, 0,
      'um PUT sem `ativo` RESSUSCITOU o plano desativado — a caracteristica voltaria a exigir medida sem ninguem ter pedido');
    assert.strictEqual(depois.valor_nominal, 210, `o PUT nao gravou o nominal: ${depois.valor_nominal}`);

    const reativa = await request(app).put(`${ROTA}/${criada.body.id}`).send({ ativo: 1 });
    assert.strictEqual(reativa.status, 200, `PUT de reativacao falhou: ${reativa.status}`);
    const viva = (await listar({ material_id: mat })).body.find((p) => p.id === criada.body.id);
    assert.ok(viva, 'o plano reativado nao voltou ao GET padrao');
  });

  // ── RN-01: desativar ───────────────────────────────────────────────────────────────────────
  await test('(17) RN-01 desativar: soft delete — some do GET, a linha FICA, e ?todos=1 traz de volta', async () => {
    const mat = await novoMaterial('Delete');
    const caracteristica = uniq('Planeza');
    const criada = await criar({ material_id: mat, caracteristica, valor_nominal: 0.1, desvio_inferior: -0.05, desvio_superior: 0.05 });
    assert.strictEqual(criada.status, 201, `setup falhou: ${criada.status}`);
    assert.ok(caracteristicasDe(await listar({ material_id: mat })).includes(caracteristica),
      'o GET NAO trazia a caracteristica antes da desativacao — sem esta guarda "sumiu" passaria com a criacao quebrada');

    const del = await request(app).delete(`${ROTA}/${criada.body.id}`);
    assert.strictEqual(del.status, 200, `DELETE falhou: ${del.status} ${JSON.stringify(del.body)}`);

    const linha = await dbGet(db, 'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [criada.body.id]);
    assert.ok(linha, `a linha ${criada.body.id} FOI APAGADA — as medidas ja gravadas apontam para ela (plano_id NOT NULL)`);
    assert.strictEqual(linha.ativo, 0, `esperava ativo = 0, veio ${linha.ativo}`);

    assert.ok(!caracteristicasDe(await listar({ material_id: mat })).includes(caracteristica),
      'a caracteristica desativada continua no GET padrao — a inspecao seguiria pedindo a medida');

    const todos = await listar({ material_id: mat, todos: '1' });
    assert.strictEqual(todos.status, 200, `GET ?todos=1 falhou: ${todos.status}`);
    const inativa = todos.body.find((p) => p.id === criada.body.id);
    assert.ok(inativa, 'GET ?todos=1 nao traz a caracteristica inativa — a tela nao consegue reativar');
    assert.strictEqual(inativa.ativo, 0, `?todos=1 devolveu ativo = ${inativa.ativo}`);
  });

  await test('(18) DELETE idempotente: 2a chamada e 200 `ja_inativo` SEM 2a auditoria; inexistente e 404', async () => {
    const mat = await novoMaterial('Idem');
    const criada = await criar({ material_id: mat, caracteristica: uniq('Rugosidade'), valor_nominal: 1.6, desvio_inferior: -0.4, desvio_superior: 0.4 });
    const primeira = await request(app).delete(`${ROTA}/${criada.body.id}`);
    assert.strictEqual(primeira.status, 200, `1o DELETE falhou: ${primeira.status}`);
    assert.strictEqual(primeira.body.ja_inativo, undefined, `o 1o DELETE nao pode vir com ja_inativo: ${JSON.stringify(primeira.body)}`);

    const contarExclusoes = async () => (await dbAll(db,
      "SELECT id FROM auditoria_log_almoxarifado WHERE entidade = 'plano_inspecao' AND entidade_id = ? AND acao = 'EXCLUSAO'",
      [criada.body.id])).length;
    assert.strictEqual(await contarExclusoes(), 1,
      'o 1o DELETE tinha de deixar UMA linha de auditoria — sem ela o cenario abaixo mede zero contra zero');

    const segunda = await request(app).delete(`${ROTA}/${criada.body.id}`);
    assert.strictEqual(segunda.status, 200, `2o DELETE deveria ser 200 idempotente, veio ${segunda.status}`);
    assert.strictEqual(segunda.body.ja_inativo, true,
      `2o DELETE sem ja_inativo: ${JSON.stringify(segunda.body)} — sem o AND ativo = 1 o changes conta a linha `
      + 'que o WHERE CASOU, nao a que MUDOU');
    assert.strictEqual(await contarExclusoes(), 1,
      'a 2a desativacao virou linha na trilha sem ter mudado nada (licao da Etapa 23)');

    const fantasma = await request(app).delete(`${ROTA}/999888`);
    assert.strictEqual(fantasma.status, 404, `id inexistente deveria dar 404, veio ${fantasma.status}`);
  });

  // ── Auditoria ──────────────────────────────────────────────────────────────────────────────
  await test('(19) os tres atos deixam rastro, com rotulo "Plano de inspeção" na tela da auditoria', async () => {
    const mat = await novoMaterial('Auditada');
    const criada = await criar({ material_id: mat, caracteristica: uniq('Auditada'), valor_nominal: 50, desvio_inferior: -0.5, desvio_superior: 0.5 });
    await request(app).put(`${ROTA}/${criada.body.id}`).send({ valor_nominal: 51 });
    await request(app).delete(`${ROTA}/${criada.body.id}`);

    const trilha = await request(app).get('/api/almoxarifado/auditoria')
      .query({ entidade: 'plano_inspecao', entidade_id: criada.body.id });
    assert.strictEqual(trilha.status, 200, `GET auditoria falhou: ${trilha.status} ${JSON.stringify(trilha.body)}`);
    const itens = trilha.body.itens || trilha.body;
    const acoes = itens.map((i) => i.acao);
    for (const esperada of ['CRIACAO', 'EDICAO', 'EXCLUSAO']) {
      assert.ok(acoes.includes(esperada), `falta ${esperada} na trilha: ${JSON.stringify(acoes)}`);
    }
    assert.strictEqual(itens[0].entidade_rotulo, 'Plano de inspeção',
      `entidade_rotulo cru na tela de auditoria: ${JSON.stringify(itens[0].entidade_rotulo)} — sem a linha em `
      + 'ROTULOS_ENTIDADE a trilha mostraria "plano_inspecao" no meio de "Familia" e "Ferramenta"');

    const edicao = itens.find((i) => i.acao === 'EDICAO');
    const dePara = (edicao.alteracoes || []).find((a) => a.campo === 'valor_nominal');
    assert.ok(dePara, `a EDICAO nao registrou o de/para do nominal: ${JSON.stringify(edicao.alteracoes)}`);
    assert.strictEqual(dePara.de, 50, `de errado: ${JSON.stringify(dePara)}`);
    assert.strictEqual(dePara.para, 51, `para errado: ${JSON.stringify(dePara)}`);
  });

  // ── A tabela das medidas (C2), que a Task 3 preenche ───────────────────────────────────────
  await test('(20) `medidas_inspecao_almoxarifado` existe com os campos CONGELADOS e plano_id NOT NULL', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(medidas_inspecao_almoxarifado)');
    assert.ok(cols.length > 0, 'a tabela das medidas nao foi criada — a Task 3 nao tem onde gravar');
    const porNome = new Map(cols.map((c) => [c.name, c]));
    for (const nome of ['inspecao_id', 'plano_id', 'caracteristica', 'unidade', 'valor_nominal',
      'desvio_inferior', 'desvio_superior', 'valor_medido', 'conforme', 'ferramenta_id', 'ferramenta_nome']) {
      assert.ok(porNome.has(nome), `falta a coluna ${nome}: ${JSON.stringify([...porNome.keys()])}`);
    }
    // RN-05: as tolerancias sao COPIADAS para ca. Se a Task 3 gravasse so `plano_id`, editar o
    // plano reescreveria a inspecao antiga.
    assert.strictEqual(porNome.get('valor_nominal').type, 'REAL', `valor_nominal e ${porNome.get('valor_nominal').type}`);
    assert.strictEqual(porNome.get('plano_id').notnull, 1,
      'plano_id precisa ser NOT NULL: o CRUD faz SOFT delete, entao o plano nunca e apagado');
    assert.strictEqual(porNome.get('inspecao_id').notnull, 1, 'inspecao_id precisa ser NOT NULL');
    assert.strictEqual(porNome.get('valor_medido').notnull, 1,
      'valor_medido NOT NULL: uma reprovacao com valor NULL seria reprovacao sem numero por tras (RN-07)');
    assert.strictEqual(porNome.get('conforme').notnull, 1, 'conforme precisa ser NOT NULL');
  });

  await test('(21) o indice unico do plano existe, nas colunas certas e PARCIAL', async () => {
    // `PRAGMA index_list` e nao `sqlite_master`: e ele que expoe as flags `unique` e `partial`
    // (sqlite_master nao tem coluna `unique` — a consulta errada morre com "no such column").
    const idx = await dbAll(db, 'PRAGMA index_list(planos_inspecao_almoxarifado)');
    const unico = idx.find((i) => i.unique === 1);
    assert.ok(unico, `nenhum indice UNIQUE em planos_inspecao_almoxarifado: ${JSON.stringify(idx.map((i) => i.name))}`);
    assert.strictEqual(unico.partial, 1,
      `o indice unico nao e PARCIAL (partial = ${unico.partial}) — sem o WHERE ativo = 1 o soft delete tranca `
      + 'a caracteristica para sempre e o usuario nao tem como corrigir um cadastro errado');

    // AS COLUNAS, nao so o nome (licao do auditLabels.api.test.js): indice com nome certo em
    // coluna errada e a feature quebrada com o teste limpo.
    const colunas = (await dbAll(db, `PRAGMA index_info(${unico.name})`))
      .sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
    assert.deepStrictEqual(colunas, ['material_id', 'caracteristica'],
      `o indice unico esta nas colunas ${JSON.stringify(colunas)}`);
    const ddl = await dbGet(db, "SELECT sql FROM sqlite_master WHERE type='index' AND name = ?", [unico.name]);
    assert.ok(/WHERE\s+ativo\s*=\s*1/i.test(ddl?.sql || ''),
      `a clausula parcial nao e ativo = 1: ${ddl?.sql}`);
  });

  // ── A matriz de perfis, com a assercao negativa ────────────────────────────────────────────
  await test('(22) matriz de perfis: ADMIN/QUALIDADE/ENGENHARIA escrevem; os outros cinco tomam 403 nas tres rotas', async () => {
    setUser({ ...ADMIN });
    const mat = await novoMaterial('Matriz');
    const alvo = await criar({ material_id: mat, caracteristica: uniq('Alvo'), valor_nominal: 10, desvio_inferior: -1, desvio_superior: 1 });
    assert.strictEqual(alvo.status, 201,
      `o LADO POSITIVO da matriz caiu ja no ADMINISTRADOR (${alvo.status} ${JSON.stringify(alvo.body)}) — `
      + 'sem ele os 403 abaixo passariam ate com a rota inexistente');

    // NENHUMA assercao dentro dos lacos, e o usuario volta a ser ADMIN antes da primeira: um
    // `assert` que lanca no meio deixaria o harness logado como CONSULTA para o resto do arquivo.
    const barrados = [];  // quem TINHA de escrever e nao escreveu
    const passaram = [];  // quem NAO podia escrever e escreveu
    const semLeitura = [];

    for (const [rotulo, user] of PERFIS_COM_ACAO) {
      setUser(user);
      const r = await criar({ material_id: mat, caracteristica: uniq(`Por ${rotulo}`), valor_nominal: 5, desvio_inferior: -0.5, desvio_superior: 0.5 });
      if (r.status !== 201) barrados.push(`${rotulo} tomou ${r.status} no POST: ${JSON.stringify(r.body)}`);
    }

    for (const [rotulo, user] of PERFIS_SEM_ACAO) {
      setUser(user);
      const tentativas = [
        ['POST', await criar({ material_id: mat, caracteristica: uniq('Proibida'), valor_nominal: 1 })],
        ['PUT', await request(app).put(`${ROTA}/${alvo.body.id}`).send({ valor_nominal: 999 })],
        ['DELETE', await request(app).delete(`${ROTA}/${alvo.body.id}`)],
      ];
      for (const [verbo, res] of tentativas) {
        if (res.status !== 403) passaram.push(`${rotulo} passou no ${verbo} com ${res.status}`);
      }
      // A LEITURA continua aberta a qualquer usuario do modulo: quem inspeciona precisa ver o
      // plano para saber o que medir, e o gate de leitura ja e o acesso ao modulo.
      const get = await listar({ material_id: mat });
      if (get.status !== 200) semLeitura.push(`${rotulo}: ${get.status}`);
    }
    setUser({ ...ADMIN });

    assert.deepStrictEqual(barrados, [],
      `perfis que TEM a acao nao conseguiram cadastrar: ${JSON.stringify(barrados)} — e o motivo de a acao `
      + 'existir: com o gate `configurar` ([ADMINISTRADOR] sozinho) QUALIDADE e ENGENHARIA ficariam de fora');
    assert.deepStrictEqual(passaram, [],
      `perfis SEM \`gerenciar_plano_inspecao\` escreveram no plano: ${JSON.stringify(passaram)}`);
    assert.deepStrictEqual(semLeitura, [], `perfis que perderam a LEITURA do plano: ${JSON.stringify(semLeitura)}`);
    const ainda = await dbGet(db, 'SELECT valor_nominal, ativo FROM planos_inspecao_almoxarifado WHERE id = ?', [alvo.body.id]);
    assert.strictEqual(ainda.valor_nominal, 10, `o nominal mudou apesar dos 403: ${ainda.valor_nominal}`);
    assert.strictEqual(ainda.ativo, 1, `o plano foi desativado apesar dos 403: ativo = ${ainda.ativo}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
