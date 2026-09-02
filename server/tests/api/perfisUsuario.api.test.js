/**
 * Atribuição de perfil do almoxarifado por usuário.
 *
 * Antes disto o único jeito de dar perfil era o checkbox "Administrador do módulo" do
 * cadastro de usuário, que concede ADMINISTRADOR e nada mais. ALMOXARIFE, GESTOR, COMPRAS,
 * ENGENHARIA e CONSULTA só entravam por SQL, e quem não era admin caía calado no fallback
 * PRODUCAO.
 *
 * O que estes testes protegem é a PRECEDENCIA. getPerfilFromUser resolve nesta ordem:
 * superadmin, admin do módulo, role 'admin', perfil explícito, fallback PRODUCAO. Logo,
 * gravar perfil explícito para quem já é admin não tem efeito em runtime E seria apagado
 * por syncModuleAdminProfiles no próximo save do usuário — daí a rota recusar com 409 em
 * vez de gravar algo que pareceria ter funcionado.
 *
 * A tabela `usuarios` é do app principal, não do schema do almoxarifado, então o teste a
 * cria aqui (o harness só monta o schema do módulo).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { getPerfilFromUser, PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
const ALMOXARIFE = { id: 2, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO_FALLBACK = { id: 3, nome: 'Chão de Fábrica', role: 'usuario' };

async function criarUsuario(db, { id, nome, email, role = 'usuario', is_superadmin = 0, admin_modulos = '[]', ativo = 1, is_oculto = 0 }) {
  await dbRun(db,
    `INSERT INTO usuarios (id, nome, email, role, is_superadmin, admin_modulos, ativo, is_oculto)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, nome, email, role, is_superadmin, admin_modulos, ativo, is_oculto]);
}

const acharUsuario = (body, id) => body.usuarios.find((u) => u.id === id);

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, role TEXT,
    is_superadmin INTEGER DEFAULT 0, admin_modulos TEXT DEFAULT '[]',
    ativo INTEGER DEFAULT 1, is_oculto INTEGER DEFAULT 0
  )`);

  await criarUsuario(db, { id: 100, nome: 'Comum Sem Perfil', email: 'comum@t.com' });
  await criarUsuario(db, { id: 101, nome: 'Admin De Modulo', email: 'admmod@t.com', admin_modulos: '["almoxarifado"]' });
  await criarUsuario(db, { id: 102, nome: 'Super', email: 'super@t.com', is_superadmin: 1 });
  await criarUsuario(db, { id: 103, nome: 'Admin Sistema', email: 'adm@t.com', role: 'admin' });
  await criarUsuario(db, { id: 104, nome: 'Inativo', email: 'inativo@t.com', ativo: 0 });
  await criarUsuario(db, { id: 105, nome: 'Oculto', email: 'oculto@t.com', is_oculto: 1 });

  // ── Leitura ──

  await test('GET lista perfis validos e classifica a origem de cada usuário', async () => {
    const res = await request(app).get('/api/almoxarifado/perfis-usuario');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.perfis.includes('ALMOXARIFE'), JSON.stringify(res.body.perfis));

    assert.strictEqual(acharUsuario(res.body, 100).origem, 'padrao');
    assert.strictEqual(acharUsuario(res.body, 100).perfil_efetivo, 'PRODUCAO');
    ['101', '102', '103'].map(Number).forEach((id) => {
      assert.strictEqual(acharUsuario(res.body, id).origem, 'forcado', `usuário ${id} deveria ser forcado`);
      assert.strictEqual(acharUsuario(res.body, id).perfil_efetivo, 'ADMINISTRADOR');
    });
  });

  await test('GET omite usuários inativos e ocultos', async () => {
    const res = await request(app).get('/api/almoxarifado/perfis-usuario');
    assert.ok(!acharUsuario(res.body, 104), 'usuário inativo apareceu');
    assert.ok(!acharUsuario(res.body, 105), 'usuário oculto apareceu');
  });

  // ── Escrita ──

  await test('PUT define ALMOXARIFE para usuário comum e persiste', async () => {
    const res = await request(app).put('/api/almoxarifado/perfis-usuario/100').send({ perfil: 'ALMOXARIFE' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.perfil_efetivo, 'ALMOXARIFE');
    assert.strictEqual(res.body.origem, 'explicito');

    const row = await dbGet(db, 'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = 100');
    assert.strictEqual(row.perfil, 'ALMOXARIFE');
  });

  await test('PUT troca o perfil (upsert, não duplica linha)', async () => {
    await request(app).put('/api/almoxarifado/perfis-usuario/100').send({ perfil: 'GESTOR' });
    const rows = await dbGet(db, 'SELECT COUNT(*) as c FROM perfil_almoxarifado_usuario WHERE usuario_id = 100');
    assert.strictEqual(rows.c, 1, 'deveria haver exatamente 1 linha');
    const row = await dbGet(db, 'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = 100');
    assert.strictEqual(row.perfil, 'GESTOR');
  });

  await test('PUT com perfil vazio volta ao padrão (remove a linha)', async () => {
    const res = await request(app).put('/api/almoxarifado/perfis-usuario/100').send({ perfil: '' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.perfil_efetivo, 'PRODUCAO');
    assert.strictEqual(res.body.origem, 'padrao');
    const row = await dbGet(db, 'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = 100');
    assert.ok(!row, 'a linha deveria ter sido removida');
  });

  await test('PUT com perfil inexistente -> 400', async () => {
    const res = await request(app).put('/api/almoxarifado/perfis-usuario/100').send({ perfil: 'CHEFAO' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const row = await dbGet(db, 'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = 100');
    assert.ok(!row, 'nada deveria ter sido gravado');
  });

  await test('PUT em usuário inexistente -> 404', async () => {
    const res = await request(app).put('/api/almoxarifado/perfis-usuario/9999').send({ perfil: 'ALMOXARIFE' });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  // ── A precedência: o coração deste endpoint ──

  await test('PUT em quem já é admin -> 409 e NADA gravado (a linha seria ignorada e apagada)', async () => {
    for (const id of [101, 102, 103]) {
      const res = await request(app).put(`/api/almoxarifado/perfis-usuario/${id}`).send({ perfil: 'CONSULTA' });
      assert.strictEqual(res.status, 409, `usuário ${id}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.origem, 'forcado');
      const row = await dbGet(db, 'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = ?', [id]);
      assert.ok(!row, `usuário ${id}: gravou perfil que seria ignorado em runtime`);
    }
  });

  await test('[coerência] o perfil_efetivo do GET bate com getPerfilFromUser', async () => {
    await request(app).put('/api/almoxarifado/perfis-usuario/100').send({ perfil: 'COMPRAS' });
    const res = await request(app).get('/api/almoxarifado/perfis-usuario');

    for (const u of res.body.usuarios) {
      const row = await dbGet(db, 'SELECT role, is_superadmin, admin_modulos FROM usuarios WHERE id = ?', [u.id]);
      let mods = []; try { mods = JSON.parse(row.admin_modulos || '[]'); } catch { mods = []; }
      // monta o req.user como enrichUserFromDb monta
      const comoNoRuntime = {
        id: u.id,
        role: row.role,
        is_superadmin: row.is_superadmin,
        admin_modulos: mods,
        perfil_almoxarifado: mods.includes('almoxarifado') ? 'ADMINISTRADOR' : (u.perfil_explicito || null),
      };
      assert.strictEqual(getPerfilFromUser(comoNoRuntime), u.perfil_efetivo,
        `${u.nome}: GET disse ${u.perfil_efetivo}, getPerfilFromUser diz ${getPerfilFromUser(comoNoRuntime)}`);
    }
  });

  await test('[integração] perfil atribuído aqui libera a rota correspondente', async () => {
    // CONSULTA não movimenta; ALMOXARIFE movimenta. Prova que a atribuição tem efeito real.
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
      ['PERF-001', 'Material perfil', 100]);

    setUser({ id: 100, nome: 'Comum', role: 'usuario', perfil_almoxarifado: 'CONSULTA' });
    const negado = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: r.lastID, tipo: 'ENTRADA', quantidade: 1 });
    assert.strictEqual(negado.status, 403, `CONSULTA deveria ser barrado: ${negado.status}`);

    setUser({ id: 100, nome: 'Comum', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' });
    const ok = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: r.lastID, tipo: 'ENTRADA', quantidade: 1 });
    assert.notStrictEqual(ok.status, 403, `ALMOXARIFE não deveria ser barrado: ${JSON.stringify(ok.body)}`);
    setUser(ADMIN);
  });

  // ── A trilha: conceder e REVOGAR acesso ao módulo têm de aparecer (Etapa 24, RN-06) ──
  //
  // A asserção de peso destes três cenários é a CONTAGEM de linhas, não o conteúdo da última.
  // O defeito que eles guardam era exatamente uma omissão: o caminho "perfil vazio = voltar ao
  // padrão" apagava a linha e retornava ANTES do registrarAuditoria, então revogar o acesso de
  // alguém não deixava rastro nenhum — e um teste que olhasse só "a última linha da trilha"
  // passaria com o bug presente, porque a última linha continuaria sendo a concessão anterior.

  const contarTrilha = async (usuarioId) => (await dbGet(db,
    `SELECT COUNT(*) as c FROM auditoria_log_almoxarifado
     WHERE entidade = 'perfil_almoxarifado_usuario' AND entidade_id = ?`, [usuarioId])).c;

  const ultimaTrilha = (usuarioId) => dbGet(db,
    `SELECT * FROM auditoria_log_almoxarifado
     WHERE entidade = 'perfil_almoxarifado_usuario' AND entidade_id = ?
     ORDER BY id DESC LIMIT 1`, [usuarioId]);

  await test('PUT audita a primeira atribuição, com dados_anteriores dizendo que não havia perfil', async () => {
    await criarUsuario(db, { id: 106, nome: 'Alvo Da Trilha', email: 'trilha@t.com' });
    // Semeadura com valor CONHECIDO: sem esta limpeza a guarda abaixo poderia derrubar o
    // cenário por estado herdado, e não pela asserção de peso.
    await dbRun(db, 'DELETE FROM perfil_almoxarifado_usuario WHERE usuario_id = 106');
    await dbRun(db, `DELETE FROM auditoria_log_almoxarifado
      WHERE entidade = 'perfil_almoxarifado_usuario' AND entidade_id = 106`);
    assert.strictEqual(await contarTrilha(106), 0, 'semeadura falhou: a trilha do 106 não começou vazia');

    const res = await request(app).put('/api/almoxarifado/perfis-usuario/106').send({ perfil: 'ALMOXARIFE' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await contarTrilha(106), 1, 'a atribuição de perfil não gerou linha de auditoria');

    const linha = await ultimaTrilha(106);
    const de = JSON.parse(linha.dados_anteriores || 'null');
    const para = JSON.parse(linha.dados_novos || 'null');
    assert.ok(de, 'dados_anteriores ficou nulo: a tela de auditoria mostra a concessão sem o "de"');
    assert.strictEqual(de.perfil, null,
      `dados_anteriores deveria dizer que não havia perfil, veio ${JSON.stringify(de.perfil)}`);
    assert.strictEqual(para.perfil, 'ALMOXARIFE', JSON.stringify(para));
    assert.strictEqual(linha.usuario_id, ADMIN.id, 'a trilha tem de dizer QUEM concedeu');
  });

  await test('PUT que troca o perfil audita o de/para (dados_anteriores traz o anterior)', async () => {
    const antes = await contarTrilha(106);
    const res = await request(app).put('/api/almoxarifado/perfis-usuario/106').send({ perfil: 'GESTOR' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await contarTrilha(106), antes + 1, 'a troca de perfil não gerou linha de auditoria');

    const linha = await ultimaTrilha(106);
    const de = JSON.parse(linha.dados_anteriores || 'null');
    assert.ok(de, 'dados_anteriores ficou nulo na troca');
    assert.strictEqual(de.perfil, 'ALMOXARIFE',
      `a troca tem de registrar o perfil ANTERIOR, veio ${JSON.stringify(de.perfil)}`);
    assert.strictEqual(JSON.parse(linha.dados_novos).perfil, 'GESTOR');
  });

  await test('PUT que remove o perfil gera uma linha NOVA na trilha (revogar não pode ser invisível)', async () => {
    const antes = await contarTrilha(106);
    const res = await request(app).put('/api/almoxarifado/perfis-usuario/106').send({ perfil: '' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.origem, 'padrao', 'contrato C2 mudou');

    const depois = await contarTrilha(106);
    assert.strictEqual(depois, antes + 1,
      `a remoção do perfil não gerou linha de auditoria: a trilha tinha ${antes} e continuou com ${depois}`);

    const linha = await ultimaTrilha(106);
    const de = JSON.parse(linha.dados_anteriores || 'null');
    const para = JSON.parse(linha.dados_novos || 'null');
    assert.ok(de, 'a revogação não registrou dados_anteriores');
    assert.strictEqual(de.perfil, 'GESTOR', 'a revogação tem de dizer QUAL perfil saiu');
    assert.ok(para, 'a revogação não registrou dados_novos');
    assert.strictEqual(para.perfil, null, 'dados_novos tem de deixar explícito que o perfil saiu');
    assert.strictEqual(para.perfil_efetivo, 'PRODUCAO', 'o efetivo voltou a ser o padrão — tem de estar dito');
    assert.strictEqual(para.origem, 'padrao');
  });

  // ── Quem pode mexer nisso ──

  await test('exige perfil `configurar`: ALMOXARIFE e PRODUCAO recebem 403', async () => {
    for (const u of [ALMOXARIFE, PRODUCAO_FALLBACK]) {
      setUser(u);
      const g = await request(app).get('/api/almoxarifado/perfis-usuario');
      assert.strictEqual(g.status, 403, `${u.nome} leu a lista de perfis`);
      const p = await request(app).put('/api/almoxarifado/perfis-usuario/100').send({ perfil: 'ADMINISTRADOR' });
      assert.strictEqual(p.status, 403, `${u.nome} conseguiu atribuir perfil`);
    }
    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
