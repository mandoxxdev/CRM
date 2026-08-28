/**
 * Etapa 19, Task 3 — auditoria dos cadastros e permissoes que vivem em
 * `routes/almoxarifado/extended.js`: centros de custo, almoxarifados e permissoes de setor.
 *
 * O que este arquivo prova (e por que cada assercao existe):
 *
 * - RN-01 (C2 #18-#21): criar/editar centro de custo e almoxarifado deixam rastro com de/para.
 *   O `SELECT *` do "antes" ja existe nos dois PUTs (var `atual`) — a auditoria sai de graca.
 * - RN-03: id inexistente ja responde 404 nessas duas rotas (diferente das 4 do C3) — aqui a
 *   assercao e que o 404 continua NAO auditando.
 * - RN-07 (C5 #22/#23): permissao de setor e CONTROLE DE ACESSO — audita o de/para COMPLETO,
 *   via `getPermissoesSetor` antes e depois. No bulk, `incluidas` NAO existe no retorno do
 *   servico (ele devolve a lista inteira): e derivado de `depois.length - antes.length`,
 *   valido porque a operacao e puramente aditiva. O teste confere o numero derivado contra a
 *   contagem real da tabela — senao um `incluidas` chutado passaria verde.
 * - RN-02 no `extended.js` (C0): o stub tem TRES assercoes juntas (flag `chamado`, o ato
 *   responde 201 e gravou, zero linhas). Sem a primeira, uma rota que simplesmente NAO
 *   auditasse passaria verde e o teste seria vazio (molde: alertasNovos.api.test.js:151-159).
 *   A flag so e alcancavel se a rota chamar `audit.registrarAuditoria` pelo OBJETO — e por
 *   isso que o C0 (import por objeto neste arquivo) e pre-requisito bloqueante.
 *
 * HARNESS: a rota de permissoes usa gate inline (`!isSystemAdmin && !canConfigureAlmox`) e as
 * de cadastro usam `requirePermission('configurar')`. Um usuario com `is_superadmin: 1` passa
 * nos dois; o default do harness ({id:1, role:'admin'}) passaria nas de cadastro mas nao e o
 * que o plano fixou. Guarda anti-teste-vazio no primeiro caso.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet, dbRun } = require('../../services/almoxarifado/db');
const auditModule = require('../../services/almoxarifado/audit');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const USUARIO = { id: 9, nome: 'Admin Almox', role: 'admin', is_superadmin: 1 };
  const {
    app, db, setUser, close,
  } = await createTestApp({ user: USUARIO });

  const linhasDe = (entidade, acao, entidadeId) => {
    let sql = 'SELECT * FROM auditoria_log_almoxarifado WHERE entidade = ? AND acao = ?';
    const params = [entidade, acao];
    if (entidadeId !== undefined) { sql += ' AND entidade_id = ?'; params.push(entidadeId); }
    return dbAll(db, `${sql} ORDER BY id`, params);
  };
  const contar = async (entidade, acao, entidadeId) => (await linhasDe(entidade, acao, entidadeId)).length;
  const sufixo = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  // ── Guarda anti-teste-vazio ─────────────────────────────────────────────────────────────
  await test('[guarda] o usuario do teste NAO toma 403 em nenhum dos tres blocos', async () => {
    const cc = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: `G-CC-${sufixo()}`, nome: 'Guarda CC' });
    assert.strictEqual(cc.status, 201, `POST centros-custo recusado (${cc.status}): ${JSON.stringify(cc.body)}`);

    const alm = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: `G-AL-${sufixo()}`, nome: 'Guarda Almox' });
    assert.strictEqual(alm.status, 201, `POST almoxarifados recusado (${alm.status}): ${JSON.stringify(alm.body)}`);

    const setores = await request(app).get('/api/almoxarifado/setores-requisicao');
    assert.strictEqual(setores.status, 200, JSON.stringify(setores.body));
    assert.ok(setores.body.length > 0, 'nenhum setor de requisicao — os cenarios de RN-07 nao exercitariam nada');
    const perm = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setores.body[0].id}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(perm.status, 200, `PUT permissoes recusado (${perm.status}): ${JSON.stringify(perm.body)} `
      + '— se for 403, TODOS os cenarios de RN-07 estariam provando nada');
  });

  // ── Centros de custo (C2 #18/#19) ───────────────────────────────────────────────────────
  await test('centro de custo: POST audita CRIACAO com o id criado e sem dados_anteriores', async () => {
    const codigo = `CC-${sufixo()}`;
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo, nome: 'Manutencao Industrial' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const linhas = await linhasDe('centro_custo', 'CRIACAO', res.body.id);
    assert.strictEqual(linhas.length, 1, 'a criacao de centro de custo nao deixou rastro');
    assert.strictEqual(linhas[0].usuario_id, 9);
    assert.strictEqual(linhas[0].usuario_nome, 'Admin Almox');
    assert.strictEqual(linhas[0].dados_anteriores, null, 'criacao nao tem "antes"');
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.codigo, codigo);
    assert.strictEqual(dn.nome, 'Manutencao Industrial');
  });

  await test('centro de custo: PUT audita EDICAO com o de/para (o SELECT * ja existia)', async () => {
    const codigo = `CC-${sufixo()}`;
    const criado = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo, nome: 'Nome Antigo' });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const res = await request(app).put(`/api/almoxarifado/centros-custo/${criado.body.id}`)
      .send({ nome: 'Nome Novo' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('centro_custo', 'EDICAO', criado.body.id);
    assert.strictEqual(linhas.length, 1, 'a edicao de centro de custo nao deixou rastro');
    const da = JSON.parse(linhas[0].dados_anteriores);
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(da.nome, 'Nome Antigo', 'o "antes" do log nao e o estado anterior');
    assert.strictEqual(dn.nome, 'Nome Novo');
    assert.strictEqual(dn.codigo, codigo, 'campo nao enviado tem de aparecer com o valor mantido');

    const col = await dbGet(db, 'SELECT nome FROM centros_custo_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(col.nome, 'Nome Novo', 'a rota nem gravou — o cenario nao exercitou nada');
  });

  await test('centro de custo: PUT em id inexistente responde 404 e NAO audita', async () => {
    const antes = await contar('centro_custo', 'EDICAO');
    const res = await request(app).put('/api/almoxarifado/centros-custo/987654').send({ nome: 'Fantasma' });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(await contar('centro_custo', 'EDICAO'), antes,
      'auditou uma edicao que nao aconteceu');
  });

  // ── Almoxarifados (C2 #20/#21) ──────────────────────────────────────────────────────────
  await test('almoxarifado: POST audita CRIACAO com o id criado', async () => {
    const codigo = `AL-${sufixo()}`;
    const res = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo, nome: 'Almoxarifado Central', descricao: 'Predio A' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const linhas = await linhasDe('almoxarifado', 'CRIACAO', res.body.id);
    assert.strictEqual(linhas.length, 1, 'a criacao de almoxarifado nao deixou rastro');
    assert.strictEqual(linhas[0].dados_anteriores, null);
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.codigo, codigo);
    assert.strictEqual(dn.nome, 'Almoxarifado Central');
    assert.strictEqual(dn.descricao, 'Predio A');
  });

  await test('almoxarifado: PUT audita EDICAO com o de/para', async () => {
    const codigo = `AL-${sufixo()}`;
    const criado = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo, nome: 'Deposito Velho' });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const res = await request(app).put(`/api/almoxarifado/almoxarifados/${criado.body.id}`)
      .send({ nome: 'Deposito Novo', descricao: 'Predio B' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('almoxarifado', 'EDICAO', criado.body.id);
    assert.strictEqual(linhas.length, 1, 'a edicao de almoxarifado nao deixou rastro');
    const da = JSON.parse(linhas[0].dados_anteriores);
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(da.nome, 'Deposito Velho');
    assert.strictEqual(da.descricao, null);
    assert.strictEqual(dn.nome, 'Deposito Novo');
    assert.strictEqual(dn.descricao, 'Predio B');
  });

  await test('almoxarifado: PUT em id inexistente responde 404 e NAO audita', async () => {
    const antes = await contar('almoxarifado', 'EDICAO');
    const res = await request(app).put('/api/almoxarifado/almoxarifados/987654').send({ nome: 'Fantasma' });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(await contar('almoxarifado', 'EDICAO'), antes,
      'auditou uma edicao que nao aconteceu');
  });

  await test('almoxarifado: inativar com localizacao ativa e recusado (400) e NAO audita', async () => {
    // A rota tem uma guarda de negocio ANTES do UPDATE. Se a auditoria estivesse antes da
    // escrita (e nao pos-escrita, como manda a arquitetura), esta linha nasceria.
    const criado = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: `AL-${sufixo()}`, nome: 'Com Localizacao' });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    // INSERT direto de proposito: a rota POST /localizacoes esta sendo mexida pela Task 2 em
    // paralelo, e este cenario nao e sobre ela — so precisa de UMA localizacao ativa ligada
    // ao almoxarifado para a guarda de negocio disparar.
    await dbRun(db,
      'INSERT INTO localizacoes_almoxarifado (codigo, almoxarifado_id, ativo) VALUES (?,?,1)',
      [`LOC-${sufixo()}`, criado.body.id]);

    const antes = await contar('almoxarifado', 'EDICAO', criado.body.id);
    const res = await request(app).put(`/api/almoxarifado/almoxarifados/${criado.body.id}`).send({ ativo: 0 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(await contar('almoxarifado', 'EDICAO', criado.body.id), antes,
      'auditou uma inativacao que a propria rota recusou');
  });

  // ── Permissoes de setor (C5 #22/#23 — RN-07) ────────────────────────────────────────────
  const setoresRes = await request(app).get('/api/almoxarifado/setores-requisicao');
  const setorId = setoresRes.body[0].id;
  const setorBulkId = setoresRes.body[1] ? setoresRes.body[1].id : setoresRes.body[0].id;

  await test('RN-07: PUT de permissoes audita o de/para COMPLETO (lista anterior x nova)', async () => {
    const familias = await dbAll(db, 'SELECT id FROM familias_material_almoxarifado WHERE ativo = 1 ORDER BY id LIMIT 3');
    assert.ok(familias.length >= 3, 'sem familias semeadas o cenario nao exercitaria nada');

    // Estado inicial conhecido: 2 familias.
    const inicial = await request(app).put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [{ familia_id: familias[0].id }, { familia_id: familias[1].id }] });
    assert.strictEqual(inicial.status, 200, JSON.stringify(inicial.body));

    const antes = await contar('setor_permissao', 'EDICAO', setorId);
    const res = await request(app).put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [{ familia_id: familias[2].id }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('setor_permissao', 'EDICAO', setorId);
    assert.strictEqual(linhas.length - antes, 1, 'esperava exatamente 1 linha por PUT de permissoes');
    const linha = linhas[linhas.length - 1];
    const da = JSON.parse(linha.dados_anteriores);
    const dn = JSON.parse(linha.dados_novos);
    const idsDe = (v) => (Array.isArray(v) ? v : v.permissoes).map((p) => p.familia_id).sort((a, b) => a - b);
    assert.deepStrictEqual(idsDe(da), [familias[0].id, familias[1].id].sort((a, b) => a - b),
      'o "antes" nao e a lista que estava valendo — de/para COMPLETO e o ponto da RN-07');
    assert.deepStrictEqual(idsDe(dn), [familias[2].id],
      'o "depois" nao e a lista nova');
  });

  await test('RN-07: o de/para vem do estado REAL da tabela, nao do payload', async () => {
    const familias = await dbAll(db, 'SELECT id FROM familias_material_almoxarifado WHERE ativo = 1 ORDER BY id LIMIT 2');
    // Entrada invalida (sem nenhum id) e DESCARTADA pelo servico: o log tem de refletir a
    // tabela depois da escrita, nao o array que chegou.
    const res = await request(app).put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [{ familia_id: familias[0].id }, { categoria_id: null, familia_id: null, material_id: null }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const linhas = await linhasDe('setor_permissao', 'EDICAO', setorId);
    const dn = JSON.parse(linhas[linhas.length - 1].dados_novos);
    const lista = Array.isArray(dn) ? dn : dn.permissoes;
    assert.strictEqual(lista.length, 1,
      `o log guardou ${lista.length} permissoes, mas a tabela ficou com 1 — logou o payload, nao o efeito`);
  });

  await test('C5 #23: bulk-tipo audita INCLUSAO_EM_LOTE com `incluidas` DERIVADO (depois - antes)', async () => {
    // Estado inicial conhecido: zero permissoes no setor do bulk.
    await request(app).put(`/api/almoxarifado/setores-requisicao/${setorBulkId}/permissoes`).send({ permissoes: [] });

    const antesTabela = await dbGet(db,
      'SELECT COUNT(*) as c FROM setor_material_permitido WHERE setor_id = ?', [setorBulkId]);
    const res = await request(app)
      .post(`/api/almoxarifado/setores-requisicao/${setorBulkId}/permissoes/bulk-tipo`)
      .send({ tipo_uso: 'industrial' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const depoisTabela = await dbGet(db,
      'SELECT COUNT(*) as c FROM setor_material_permitido WHERE setor_id = ?', [setorBulkId]);
    const incluidasReais = depoisTabela.c - antesTabela.c;
    assert.ok(incluidasReais > 0, 'o bulk nao incluiu nada — o cenario nao exercitaria a derivacao');

    const linhas = await linhasDe('setor_permissao', 'INCLUSAO_EM_LOTE', setorBulkId);
    assert.strictEqual(linhas.length, 1, 'o bulk nao deixou rastro');
    const dn = JSON.parse(linhas[0].dados_novos);
    assert.strictEqual(dn.tipo_uso, 'industrial');
    assert.strictEqual(dn.incluidas, incluidasReais,
      `o log diz ${dn.incluidas} inclusoes e a tabela ganhou ${incluidasReais} linhas`);
    // de/para completo tambem no bulk (e controle de acesso igual)
    const da = JSON.parse(linhas[0].dados_anteriores);
    const listaAntes = Array.isArray(da) ? da : da.permissoes;
    assert.strictEqual(listaAntes.length, antesTabela.c, 'o "antes" do bulk nao e a lista anterior');
  });

  await test('C5 #23: bulk repetido nao inclui nada e o log diz `incluidas: 0` (nao inventa numero)', async () => {
    const res = await request(app)
      .post(`/api/almoxarifado/setores-requisicao/${setorBulkId}/permissoes/bulk-tipo`)
      .send({ tipo_uso: 'industrial' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhas = await linhasDe('setor_permissao', 'INCLUSAO_EM_LOTE', setorBulkId);
    assert.strictEqual(linhas.length, 2, 'o segundo bulk nao deixou rastro');
    const dn = JSON.parse(linhas[1].dados_novos);
    assert.strictEqual(dn.incluidas, 0,
      `bulk sem efeito registrou ${dn.incluidas} inclusoes — o numero e chutado, nao derivado`);
  });

  await test('permissoes: usuario sem poder toma 403 e NAO audita', async () => {
    // Guarda de que a auditoria e pos-escrita: um 403 nao pode virar linha de log.
    const antes = await dbAll(db, "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'setor_permissao'");
    setUser({ id: 4, nome: 'Comum', role: 'user' });
    try {
      const res = await request(app)
        .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
        .send({ permissoes: [] });
      assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    } finally {
      setUser(USUARIO);
    }
    const depois = await dbAll(db, "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'setor_permissao'");
    assert.strictEqual(depois.length, antes.length, 'um 403 virou linha de auditoria');
  });

  // ── RN-02 no extended.js (C0) ───────────────────────────────────────────────────────────
  await test('RN-02: registrarAuditoria explodindo nao derruba o POST /centros-custo', async () => {
    const codigo = `CC-RN02-${sufixo()}`;
    const antes = await contar('centro_custo', 'CRIACAO');

    const original = auditModule.registrarAuditoria;
    let chamado = false;
    auditModule.registrarAuditoria = async () => {
      chamado = true;
      throw new Error('SABOTAGEM: auditoria explodiu');
    };
    try {
      const res = await request(app).post('/api/almoxarifado/centros-custo')
        .send({ codigo, nome: 'Sobrevive a auditoria' });
      // (1) o stub TEM de ter sido alcancado — sem isto, uma rota que simplesmente NAO
      //     auditasse passaria verde e este teste seria vazio. So o import por OBJETO (C0)
      //     torna o stub alcancavel; com o `const { registrarAuditoria }` da linha 15 o
      //     binding desestruturado escapa da substituicao.
      assert.ok(chamado, 'o stub sabotado nao foi alcancado: ou a rota nao audita, ou audita '
        + 'pelo binding desestruturado (o C0, import por objeto, e o que torna o stub alcancavel)');
      // (2) o ato responde normal e GRAVOU
      assert.strictEqual(res.status, 201, `auditoria derrubou o ato: ${JSON.stringify(res.body)}`);
      const col = await dbGet(db, 'SELECT nome FROM centros_custo_almoxarifado WHERE codigo = ?', [codigo]);
      assert.ok(col && col.nome === 'Sobrevive a auditoria', 'o centro de custo nao foi gravado');
    } finally {
      auditModule.registrarAuditoria = original;
    }
    // (3) nenhuma linha nasceu
    assert.strictEqual(await contar('centro_custo', 'CRIACAO'), antes,
      'a auditoria sabotada gravou linha assim mesmo');
  });

  await test('RN-02: registrarAuditoria explodindo nao derruba o PUT de permissoes de setor', async () => {
    const antes = await contar('setor_permissao', 'EDICAO', setorId);
    const original = auditModule.registrarAuditoria;
    let chamado = false;
    auditModule.registrarAuditoria = async () => {
      chamado = true;
      throw new Error('SABOTAGEM: auditoria explodiu');
    };
    try {
      const res = await request(app).put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
        .send({ permissoes: [] });
      assert.ok(chamado, 'o stub sabotado nao foi alcancado na rota de permissoes');
      assert.strictEqual(res.status, 200, `auditoria derrubou o ato: ${JSON.stringify(res.body)}`);
      const linhas = await dbGet(db,
        'SELECT COUNT(*) as c FROM setor_material_permitido WHERE setor_id = ?', [setorId]);
      assert.strictEqual(linhas.c, 0, 'as permissoes nao foram gravadas');
    } finally {
      auditModule.registrarAuditoria = original;
    }
    assert.strictEqual(await contar('setor_permissao', 'EDICAO', setorId), antes,
      'a auditoria sabotada gravou linha assim mesmo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
