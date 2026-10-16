/**
 * Etapa 126 (D (125), B815) — o *Editar* da aba Familias manda o que LEU (`campos_lidos`): o `PUT /familias/:id` recusa (409) desfazer
 * o nome, o tipo de uso ou a descricao que outra pessoa mudou depois de a lista carregar (RN-20..RN-28 do plano da Etapa 126).
 *
 * Antes: o *Editar* mandava `{nome, descricao, tipo_uso}` do formulario, preenchido da lista — outro Administrador que tinha mudado a
 * descricao (ou o tipo de uso) depois de a lista carregar tinha a mudanca desfeita calada ("ultimo que salva vence", D (125) item M5).
 *
 * Executar: cd server && node tests/api/familiaCamposLidos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const L_NOME = 'Nome é obrigatório';
const L_FORMA = 'Campos lidos inválidos';
const L409 = 'A família mudou enquanto era salva — nada foi gravado. Recarregue a família e salve de novo.';
const MEIO = ' por outra pessoa depois que você abriu a edição — salvar desfaria ';
const FIM = ', e nada foi gravado. Recarregue a lista e edite de novo.';
const E1 = (tipo, codigo, rotulos) => (rotulos.length === 1
  ? `O campo "${rotulos[0]}" da ${tipo} ${codigo} foi mudado${MEIO}essa mudança${FIM}`
  : `Os campos ${rotulos.slice(0, -1).map((r) => `"${r}"`).join(', ')} e "${rotulos[rotulos.length - 1]}" da ${tipo} ${codigo} `
    + `foram mudados${MEIO}essas mudanças${FIM}`);

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  const familia = async ({ parent = null, ativo = 1, descricao = 'desc', tipo_uso = 'industrial', nome } = {}) => {
    seq += 1;
    const n = nome === undefined ? `Familia F126 ${seq}` : nome;
    const codigo = `F126-${seq}`;
    const id = (await dbRun(db, `INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id, ativo, descricao, tipo_uso)
      VALUES (?, ?, ?, ?, ?, ?)`, [codigo, n, parent, ativo, descricao, tipo_uso])).lastID;
    return { id, codigo, nome: n };
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/familias/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT nome, ativo, descricao, tipo_uso, parent_id FROM familias_material_almoxarifado WHERE id = ?', [id]);
  const auditorias = async (id) => (await dbGet(db, `SELECT COUNT(*) AS c FROM auditoria_log_almoxarifado
    WHERE entidade = 'familia' AND entidade_id = ?`, [id])).c;
  // "abrir" = o que a aba leu da lista (a linha crua do GET), e o corpo que o Editar monta a partir dela.
  const abrir = async (u, id) => {
    const r = await as(u, () => request(app).get('/api/almoxarifado/familias?ativo=all'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const fam = r.body.find((f) => f.id === id);
    assert.ok(fam, 'a familia nao veio na lista');
    const lidos = { nome: fam.nome ?? null, tipo_uso: fam.tipo_uso ?? null, descricao: fam.descricao ?? null };
    return {
      fam,
      corpo: (mudancas = {}) => ({
        nome: fam.nome, descricao: fam.descricao || '', tipo_uso: fam.tipo_uso || 'ambos', ...mudancas, campos_lidos: { ...lidos },
      }),
    };
  };
  const outro = (id, campos) => {
    const cols = Object.keys(campos);
    return dbRun(db, `UPDATE familias_material_almoxarifado SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => campos[c]), id]);
  };

  // ── RN-20 / RN-21 ──────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-20] descricao mudada por outro: o Editar que renomeia -> 409 singular "Descrição", nada gravado, sem Auditoria', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: 'desc do outro' });
    const antes = await auditorias(f.id);
    const r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', f.codigo, ['Descrição']));
    assert.deepStrictEqual(await linha(f.id), { nome: f.nome, ativo: 1, descricao: 'desc do outro', tipo_uso: 'industrial', parent_id: null });
    assert.strictEqual(await auditorias(f.id), antes, 'gravou Auditoria de uma edicao recusada');
  });

  await test('[RN-20] vale para o Super Administrador e para a subfamilia ("da subfamília")', async () => {
    const raiz = await familia();
    const sub = await familia({ parent: raiz.id });
    const a = await abrir(SUPER, sub.id);
    await outro(sub.id, { nome: 'Nome do outro' });
    const r = await put(SUPER, sub.id, a.corpo({ descricao: 'nova' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('subfamília', sub.codigo, ['Nome']));
    assert.strictEqual((await linha(sub.id)).descricao, 'desc');
  });

  await test('[RN-21] nome e tipo de uso mudados -> plural "Nome" e "Tipo de uso"; os tres -> na ordem da tela', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    await outro(f.id, { nome: 'Outro nome', tipo_uso: 'administrativo' });
    let r = await put(ADM, f.id, a.corpo({ descricao: 'minha' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', f.codigo, ['Nome', 'Tipo de uso']));
    await outro(f.id, { descricao: 'outra desc' });
    r = await put(ADM, f.id, a.corpo({ descricao: 'minha' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', f.codigo, ['Nome', 'Tipo de uso', 'Descrição']));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Outro nome', ativo: 1, descricao: 'outra desc', tipo_uso: 'administrativo', parent_id: null });
  });

  await test('[RN-20] o tipo de uso mudado por outro pela ROTA (outro Administrador) -> 409 "Tipo de uso"', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    const b = await abrir(SUPER, f.id);
    let r = await put(SUPER, f.id, b.corpo({ tipo_uso: 'administrativo' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', f.codigo, ['Tipo de uso']));
    assert.strictEqual((await linha(f.id)).tipo_uso, 'administrativo');
  });

  // ── RN-22 / RN-23 / RN-28 ──────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-22] lido != gravado, mas o salvar grava o gravado (digitou o mesmo) -> 200', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: 'igual', tipo_uso: 'ambos' });
    const r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada', descricao: 'igual', tipo_uso: 'ambos' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Renomeada', ativo: 1, descricao: 'igual', tipo_uso: 'ambos', parent_id: null });
  });

  await test('[RN-23] sem campos_lidos -> o de hoje (200, o corpo gravado por cima do outro)', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: 'desc do outro' });
    const corpo = a.corpo({ nome: 'Renomeada' });
    delete corpo.campos_lidos;
    const r = await put(ADM, f.id, corpo);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(f.id)).descricao, 'desc');
  });

  await test('[RN-23] chave parcial: so as presentes comparam; chave fora da lista e ignorada', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: 'desc do outro' });
    const corpo = a.corpo({ nome: 'Renomeada' });
    delete corpo.campos_lidos.descricao;
    corpo.campos_lidos.ativo = 0; corpo.campos_lidos.parent_id = 99; corpo.campos_lidos.codigo = 'X'; corpo.campos_lidos.qualquer = 'y';
    const r = await put(ADM, f.id, corpo);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Renomeada', ativo: 1, descricao: 'desc', tipo_uso: 'industrial', parent_id: null });
  });

  await test('[RN-23] o Reativar ({ativo: 1}) sem campos_lidos continua 200 com o nome do outro', async () => {
    const f = await familia({ ativo: 0 });
    await outro(f.id, { nome: 'Nome novo do outro' });
    const r = await put(ADM, f.id, { ativo: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([(await linha(f.id)).nome, (await linha(f.id)).ativo], ['Nome novo do outro', 1]);
  });

  await test('[RN-28] lido = gravado e o usuario muda os tres -> 200, gravado, Auditoria EDICAO com o de/para', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    const r = await put(ADM, f.id, a.corpo({ nome: 'Nova', descricao: 'nova desc', tipo_uso: 'administrativo' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Nova', ativo: 1, descricao: 'nova desc', tipo_uso: 'administrativo', parent_id: null });
    const log = await dbGet(db, `SELECT acao, dados_anteriores, dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'familia' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [f.id]);
    assert.strictEqual(log.acao, 'EDICAO');
    assert.deepStrictEqual([JSON.parse(log.dados_anteriores).nome, JSON.parse(log.dados_novos).nome], [f.nome, 'Nova']);
  });

  // ── RN-24 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-24] campos_lidos null, array, texto, numero ou com valor objeto/array -> 400 "Campos lidos inválidos", nada gravado', async () => {
    const f = await familia();
    const casos = [null, [], ['nome'], 'nome', 5, true, { nome: { a: 1 } }, { descricao: ['x'] }];
    for (const c of casos) {
      const r = await put(ADM, f.id, { nome: 'Renomeada', descricao: 'd', tipo_uso: 'ambos', campos_lidos: c });
      assert.strictEqual(r.status, 400, `${JSON.stringify(c)}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, L_FORMA, JSON.stringify(c));
    }
    assert.strictEqual((await linha(f.id)).nome, f.nome);
  });

  await test('[RN-24] valores aceitos: texto, numero, booleano e null (comparados como texto)', async () => {
    const f = await familia({ nome: '123', descricao: null, tipo_uso: 'ambos' });
    const r = await put(ADM, f.id, { nome: '123', descricao: 'x', tipo_uso: 'ambos', campos_lidos: { nome: 123, descricao: null, tipo_uso: 'ambos' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const r2 = await put(ADM, f.id, { nome: '123', descricao: 'y', tipo_uso: 'ambos', campos_lidos: { nome: '123', descricao: true, tipo_uso: 'ambos' } });
    assert.strictEqual(r2.status, 409, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, E1('família', f.codigo, ['Descrição']));
  });

  // ── RN-25 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-25] ordem: Almoxarife -> 403; nome vazio -> 400; familia inexistente -> 404 (antes do 409)', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: 'desc do outro' });
    let r = await put(ALMOX, f.id, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    r = await put(ADM, f.id, a.corpo({ nome: '  ' }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, L_NOME);
    r = await put(ADM, 999999, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 404, JSON.stringify(r.body));
    // Fase 2, M6: a forma invalida e recusada antes da leitura do banco — id inexistente com forma invalida -> 400
    r = await put(ADM, 999999, { ...a.corpo({ nome: 'Renomeada' }), campos_lidos: [] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, L_FORMA);
    // e o nome vazio vem antes da forma
    r = await put(ADM, f.id, { ...a.corpo({ nome: '' }), campos_lidos: [] });
    assert.strictEqual(r.body.error, L_NOME);
  });

  await test('[RN-25] o 409 vem antes das conferencias de nivel (virar subfamilia com subfamilia ativa)', async () => {
    const raiz = await familia();
    await familia({ parent: raiz.id });
    const outraRaiz = await familia();
    const a = await abrir(ADM, raiz.id);
    await outro(raiz.id, { descricao: 'desc do outro' });
    const r = await put(ADM, raiz.id, { ...a.corpo(), parent_id: outraRaiz.id });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', raiz.codigo, ['Descrição']));
  });

  // ── RN-26 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-26] legado: descricao NULL e tipo_uso NULL, ninguem mudou -> 200 (nenhum falso 409)', async () => {
    const f = await familia({ descricao: null, tipo_uso: null });
    const a = await abrir(ADM, f.id);
    assert.deepStrictEqual([a.fam.descricao, a.fam.tipo_uso], [null, null], 'o legado nao veio cru');
    const r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Renomeada', ativo: 1, descricao: null, tipo_uso: 'ambos', parent_id: null });
  });

  await test('[RN-26] legado: tipo_uso invalido gravado e nome com espacos nas pontas, ninguem mudou -> 200', async () => {
    const f = await familia({ tipo_uso: 'xpto', nome: '  Com espacos  ' });
    const a = await abrir(ADM, f.id);
    const r = await put(ADM, f.id, a.corpo({ descricao: 'nova' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Com espacos', ativo: 1, descricao: 'nova', tipo_uso: 'ambos', parent_id: null });
  });

  await test('[RN-26, Fase 2 I1] legado "  Legado  "/NULL: B salva SEM mudar (vira "Legado"/"ambos") e A, que leu antes, edita -> 200', async () => {
    const f = await familia({ nome: '  Legado  ', tipo_uso: null, descricao: null });
    const a = await abrir(ADM, f.id);
    const b = await abrir(SUPER, f.id);
    let r = await put(SUPER, f.id, b.corpo());
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Legado', ativo: 1, descricao: null, tipo_uso: 'ambos', parent_id: null });
    r = await put(ADM, f.id, a.corpo({ nome: 'Novo', tipo_uso: 'industrial' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(f.id), { nome: 'Novo', ativo: 1, descricao: null, tipo_uso: 'industrial', parent_id: null });
  });

  await test('[RN-26] legado tipo_uso NULL lido NULL; o outro grava "industrial" -> 409 "Tipo de uso"', async () => {
    const f = await familia({ tipo_uso: null });
    const a = await abrir(ADM, f.id);
    await outro(f.id, { tipo_uso: 'industrial' });
    const r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', f.codigo, ['Tipo de uso']));
  });

  await test('[RN-26] descricao NULL mudada por outro para "x", o formulario mandando "" -> 409 "Descrição"', async () => {
    const f = await familia({ descricao: null });
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: 'x' });
    const r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1('família', f.codigo, ['Descrição']));
  });

  await test('[RN-26] a descricao do outro apagada (NULL) e o formulario mandando "" (o mesmo) -> 200', async () => {
    const f = await familia({ descricao: 'tinha' });
    const a = await abrir(ADM, f.id);
    await outro(f.id, { descricao: null });
    const r = await put(ADM, f.id, a.corpo({ nome: 'Renomeada', descricao: '' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(f.id)).descricao, null);
  });

  await test('[RN-26] o nome do outro so com espacos a mais, o formulario mandando o aparado igual -> 200 (o que gravaria = gravado aparado)', async () => {
    const f = await familia({ nome: 'Base' });
    const a = await abrir(ADM, f.id);
    await outro(f.id, { nome: 'Outro' });
    const r = await put(ADM, f.id, a.corpo({ nome: '  Outro  ' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(f.id)).nome, 'Outro');
  });

  await test('[RN-26] o tipo de uso do outro para "ambos", o formulario mandando um invalido (vira "ambos") -> 200', async () => {
    const f = await familia({ tipo_uso: 'industrial' });
    const a = await abrir(ADM, f.id);
    await outro(f.id, { tipo_uso: 'ambos' });
    const r = await put(ADM, f.id, a.corpo({ tipo_uso: 'xpto' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(f.id)).tipo_uso, 'ambos');
  });

  // ── RN-27 (a janela entre a leitura e o UPDATE) ───────────────────────────────────────────────────────────────────────
  const getOriginal = db.get.bind(db);
  let injecao = null;
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (injecao && s === 'SELECT * FROM familias_material_almoxarifado WHERE id = ?') {
      const inj = injecao; injecao = null;
      return getOriginal(sql, params, (err, row) => { inj().then(() => cb(err, row), (e) => cb(e)); });
    }
    return getOriginal(sql, params, cb);
  };

  for (const [col, valor] of [['descricao', 'na janela'], ['nome', 'Nome na janela'], ['tipo_uso', 'administrativo']]) {
    await test(`[RN-27] ${col} gravado entre a leitura e o UPDATE, com ${col} lido -> o 409 geral, o valor do outro fica`, async () => {
      const f = await familia();
      const a = await abrir(ADM, f.id);
      let rodou = false;
      injecao = async () => { rodou = true; await outro(f.id, { [col]: valor }); };
      const r = await put(ADM, f.id, a.corpo(col === 'nome' ? { descricao: 'minha' } : { nome: 'Renomeada' }));
      assert.ok(rodou, 'a injecao nao rodou — teste vazio');
      assert.strictEqual(r.status, 409, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, L409);
      const l = await linha(f.id);
      assert.strictEqual(l[col], valor);
      if (col === 'nome') assert.strictEqual(l.descricao, 'desc'); else assert.strictEqual(l.nome, f.nome);
    });
  }

  await test('[RN-27] a mesma janela SEM a coluna em campos_lidos -> o de hoje (200, o corpo por cima)', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    let rodou = false;
    injecao = async () => { rodou = true; await outro(f.id, { descricao: 'na janela' }); };
    const corpo = a.corpo({ nome: 'Renomeada' });
    delete corpo.campos_lidos.descricao;
    const r = await put(ADM, f.id, corpo);
    assert.ok(rodou, 'a injecao nao rodou — teste vazio');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([(await linha(f.id)).nome, (await linha(f.id)).descricao], ['Renomeada', 'desc']);
  });

  await test('[RN-27, Fase 2 M1] chave LIDA mas OMITIDA no corpo (preservada): o renomear na janela nao vira 409 -> 200, o nome do outro fica', async () => {
    const f = await familia();
    const a = await abrir(ADM, f.id);
    let rodou = false;
    injecao = async () => { rodou = true; await outro(f.id, { nome: 'Nome na janela' }); };
    const r = await put(ADM, f.id, { descricao: 'so a descricao', campos_lidos: a.corpo().campos_lidos });
    assert.ok(rodou, 'a injecao nao rodou — teste vazio');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([(await linha(f.id)).nome, (await linha(f.id)).descricao], ['Nome na janela', 'so a descricao']);
  });

  db.get = getOriginal;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
