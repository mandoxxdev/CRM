/**
 * Etapa 180 — T2, RN-180.05/06 (+ C1 e RN-180.01 com o termo de verdade): o termo recuperavel e verificavel.
 *
 * `GET /ferramentas/emprestimos/:id/termo` devolve o texto DA VERSAO ASSINADA; `…/termo/verificar` confere arquivo, HMAC, texto da
 * versao e elos. O HMAC cobre so a fotografia (C1): o PUT da ferramenta e a devolucao NAO mudam o "integro". A cadeia mista (EPI +
 * termo) e integra. O emprestimo anterior a exigencia -> 404 literal. `GET /emprestimos` com `tem_termo` e so `gerenciar_ferramentas`.
 *
 * Executar: cd server && node tests/api/termoFerramentaVerificacao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const permissions = require('../../services/almoxarifado/permissions');
const { emprestarComTermo, colaboradorDoCadastro, PNG_1PX } = require('../helpers/termoFerramenta');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almox', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao', email: 'chao@test.com' };

(async () => {
  const t = await createTestApp({ user: ADMIN });
  wrapDatabase(t.db);
  const { app, db, uploadsAlmoxDir } = t;
  fs.mkdirSync(uploadsAlmoxDir, { recursive: true });
  let seq = 0;
  const novaFerramenta = async () => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status, exige_calibracao, numero_serie)
      VALUES (?, ?, 'DISPONIVEL', 0, ?)`, [`PAT-V-${seq}`, `Paquimetro ${seq}`, `NS-V-${seq}`])).lastID;
  };
  const termoUrl = (id) => `/api/almoxarifado/ferramentas/emprestimos/${id}/termo`;
  const verificar = async (id) => {
    const r = await request(app).get(`${termoUrl(id)}/verificar`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const cadeia = async (caminho = '/api/almoxarifado/evidencias/cadeia/verificar') => {
    const r = await request(app).get(caminho);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };

  // A cadeia mista: EPI, termo, EPI, termo.
  const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-V-1', 'Oculos', 'EPIs', 0, 1, 'CA-7', '2099-12-31')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'ENTRADA', quantidade: 10, justificativa: 'carga' });
  const col = await colaboradorDoCadastro(db, 'GIL DA CADEIA', { setor: 'Usinagem' });
  const entregarEpi = async () => {
    const r = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(col.id)).field('material_id', String(mat)).field('quantidade', '1')
      .field('confirmacao_matricula', col.matricula)
      .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const epi1 = await entregarEpi();
  const f1 = await novaFerramenta();
  const emp1 = (await emprestarComTermo(app, db, f1, { colaborador_nome: 'GIL DA CADEIA', data_prevista_devolucao: '2031-01-31' }).expect(201)).body;
  const epi2 = await entregarEpi();
  const f2 = await novaFerramenta();
  const emp2 = (await emprestarComTermo(app, db, f2, { colaborador_nome: 'GIL DA CADEIA' }).expect(201)).body;

  await test('[RN-180.01] cadeia mista EPI + termo (4 evidencias) e integra pelas duas rotas; o EPI continua integro', async () => {
    const c = await cadeia();
    assert.deepStrictEqual(c.problemas, []);
    assert.strictEqual(c.total, 4);
    assert.deepStrictEqual(await cadeia('/api/almoxarifado/epi/cadeia/verificar'), c);
    for (const e of [epi1, epi2]) {
      assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${e.id}/verificar`)).body, { integro: true });
    }
  });

  await test('[RN-180.05] o termo: emprestimo, texto da versao assinada, fotografia e evidencia', async () => {
    const r = await request(app).get(termoUrl(emp1.id));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.emprestimo.id, emp1.id);
    assert.strictEqual(r.body.emprestimo.status, 'EMPRESTADA');
    assert.strictEqual(r.body.termo.numero, emp1.termo.numero);
    assert.strictEqual(r.body.termo.versao, 1);
    assert.strictEqual(r.body.termo.provisorio, true);
    assert.ok(r.body.termo.texto.startsWith('TEXTO PROVISÓRIO'));
    assert.deepStrictEqual(r.body.termo.ferramenta, { id: f1, codigo_patrimonio: 'PAT-V-1', numero_serie: 'NS-V-1', nome: 'Paquimetro 1' });
    assert.deepStrictEqual(r.body.termo.colaborador, { id: col.id, nome: 'GIL DA CADEIA', matricula: col.matricula, setor: 'Usinagem' });
    assert.strictEqual(r.body.termo.data_prevista_devolucao, '2031-01-31');
    assert.strictEqual(r.body.evidencia.registro_sha256, emp1.termo.evidencia.registro_sha256);
    assert.strictEqual(r.body.evidencia.confirmado_por_matricula, 1);
    assert.ok(r.body.evidencia.arquivo_url);
  });

  await test('[RN-180.05] /verificar: integro', async () => {
    assert.deepStrictEqual(await verificar(emp1.id), { integro: true });
    assert.deepStrictEqual(await verificar(emp2.id), { integro: true });
  });

  await test('[RN-180.05] uma versao nova do texto NAO muda o termo ja assinado (continua mostrando a v1 e integro)', async () => {
    assert.strictEqual((await request(app).post('/api/almoxarifado/termos/FERRAMENTA').send({ texto: 'Termo definitivo' })).status, 201);
    const r = (await request(app).get(termoUrl(emp1.id))).body;
    assert.strictEqual(r.termo.versao, 1);
    assert.ok(r.termo.texto.startsWith('TEXTO PROVISÓRIO'));
    assert.deepStrictEqual(await verificar(emp1.id), { integro: true });
  });

  await test('[RN-180.05] 1 byte trocado no PNG -> "arquivo alterado" (no /verificar e na cadeia)', async () => {
    const ev = await dbGet(db, "SELECT arquivo FROM evidencias_assinatura_almoxarifado WHERE contexto = 'TERMO_FERRAMENTA' AND contexto_id = ?", [emp1.id]);
    const caminho = path.join(uploadsAlmoxDir, ev.arquivo);
    const original = fs.readFileSync(caminho);
    const trocado = Buffer.from(original); trocado[20] ^= 0x01;
    fs.writeFileSync(caminho, trocado);
    try {
      assert.deepStrictEqual(await verificar(emp1.id), { integro: false, motivo: 'arquivo alterado' });
      assert.deepStrictEqual((await cadeia()).problemas.map((p) => p.motivo), ['arquivo alterado']);
    } finally { fs.writeFileSync(caminho, original); }
    assert.deepStrictEqual(await verificar(emp1.id), { integro: true });
  });

  await test('[C1] PUT da ferramenta mudando serie, nome e patrimonio -> o termo continua integro e mostra a FOTOGRAFIA', async () => {
    const r = await request(app).put(`/api/almoxarifado/ferramentas/${f1}`).send({ numero_serie: 'NS-TROCADA', nome: 'Outro nome', codigo_patrimonio: 'PAT-NOVO' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await verificar(emp1.id), { integro: true });
    const termo = (await request(app).get(termoUrl(emp1.id))).body.termo;
    assert.strictEqual(termo.ferramenta.numero_serie, 'NS-V-1');
    assert.strictEqual(termo.ferramenta.codigo_patrimonio, 'PAT-V-1');
  });

  await test('[C1] devolucao -> o termo continua integro; o GET mostra o emprestimo DEVOLVIDA', async () => {
    assert.strictEqual((await request(app).post(`/api/almoxarifado/emprestimos/${emp1.id}/devolver`).send({ observacoes: 'ok' })).status, 200);
    assert.deepStrictEqual(await verificar(emp1.id), { integro: true });
    assert.strictEqual((await request(app).get(termoUrl(emp1.id))).body.emprestimo.status, 'DEVOLVIDA');
    assert.strictEqual((await cadeia()).integra, true);
  });

  await test('[RN-180.06] GET /emprestimos traz tem_termo (true no assinado, false no anterior a exigencia)', async () => {
    const f3 = await novaFerramenta();
    const antigo = (await dbRun(db, "INSERT INTO emprestimos_ferramenta_almoxarifado (ferramenta_id, colaborador_nome, status) VALUES (?, 'LEGADO DIGITADO', 'DEVOLVIDA')", [f3])).lastID;
    const r = await request(app).get('/api/almoxarifado/emprestimos');
    assert.strictEqual(r.status, 200);
    const por = new Map(r.body.map((e) => [e.id, e.tem_termo]));
    assert.strictEqual(por.get(emp1.id), true);
    assert.strictEqual(por.get(emp2.id), true);
    assert.strictEqual(por.get(antigo), false);
  });

  await test('[RN-180.05] emprestimo anterior a exigencia -> 404 literal no termo e no /verificar; inexistente -> 404', async () => {
    const antigo = (await dbGet(db, "SELECT id FROM emprestimos_ferramenta_almoxarifado WHERE colaborador_nome = 'LEGADO DIGITADO'")).id;
    for (const url of [termoUrl(antigo), `${termoUrl(antigo)}/verificar`]) {
      const r = await request(app).get(url);
      assert.strictEqual(r.status, 404, url);
      assert.strictEqual(r.body.error, 'Este empréstimo não tem termo assinado (anterior à exigência)');
    }
    const r = await request(app).get(termoUrl(987654));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Empréstimo não encontrado');
  });

  await test('[RN-180.06/I4] PRODUCAO -> 403 em /emprestimos, no termo, no /verificar e na cadeia; ALMOXARIFE passa', async () => {
    t.setUser(PRODUCAO);
    try {
      for (const url of ['/api/almoxarifado/emprestimos', termoUrl(emp1.id), `${termoUrl(emp1.id)}/verificar`,
        '/api/almoxarifado/evidencias/cadeia/verificar', '/api/almoxarifado/aux/colaboradores']) {
        assert.strictEqual((await request(app).get(url)).status, 403, url);
      }
    } finally { t.setUser(ADMIN); }
    t.setUser(ALMOXARIFE);
    try {
      for (const url of ['/api/almoxarifado/emprestimos', termoUrl(emp1.id), `${termoUrl(emp1.id)}/verificar`]) {
        assert.strictEqual((await request(app).get(url)).status, 200, url);
      }
    } finally { t.setUser(ADMIN); }
  });

  await test('[RN-180.03/I4] /aux/colaboradores: so com gerenciar_ferramentas (sem entregar_epi) passa', async () => {
    const original = permissions.ACAO_PERFIS.entregar_epi;
    t.setUser(ALMOXARIFE);
    try {
      permissions.ACAO_PERFIS.entregar_epi = ['ADMINISTRADOR'];
      const r = await request(app).get('/api/almoxarifado/aux/colaboradores');
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.some((c) => c.id === col.id));
    } finally { permissions.ACAO_PERFIS.entregar_epi = original; t.setUser(ADMIN); }
  });

  // ── Adulteracoes (quem tem o banco derruba os triggers) — por ultimo, num banco que ja nao precisa ficar integro ──
  const derrubar = async (tabela) => {
    for (const nome of ['sem_update', 'sem_delete']) await dbRun(db, `DROP TRIGGER IF EXISTS trg_${tabela}_${nome}`);
  };

  await test('[C1] a fotografia adulterada (colaborador) -> "registro alterado" no /verificar e na cadeia', async () => {
    await derrubar('termos_emprestimo_ferramenta');
    await dbRun(db, "UPDATE termos_emprestimo_ferramenta SET colaborador_nome = 'OUTRA PESSOA' WHERE emprestimo_id = ?", [emp2.id]);
    assert.deepStrictEqual(await verificar(emp2.id), { integro: false, motivo: 'registro alterado' });
    const p = (await cadeia()).problemas;
    assert.deepStrictEqual(p.map((x) => [x.numero, x.motivo]), [[emp2.termo.numero, 'registro alterado']]);
    await dbRun(db, "UPDATE termos_emprestimo_ferramenta SET colaborador_nome = 'GIL DA CADEIA' WHERE emprestimo_id = ?", [emp2.id]);
    assert.deepStrictEqual(await verificar(emp2.id), { integro: true });
  });

  await test('[RN-180.05] o texto da versao assinada adulterado -> "texto do termo alterado" no /verificar e nos extras da cadeia', async () => {
    await derrubar('termos_responsabilidade_versao');
    await dbRun(db, "UPDATE termos_responsabilidade_versao SET texto = texto || ' (sem multa)' WHERE tipo = 'FERRAMENTA' AND versao = 1");
    assert.deepStrictEqual(await verificar(emp2.id), { integro: false, motivo: 'texto do termo alterado' });
    const p = (await cadeia()).problemas;
    assert.deepStrictEqual(p.map((x) => x.motivo).sort(), ['texto do termo alterado', 'texto do termo alterado']);
  });

  await test('[I2] a evidencia do ultimo termo apagada -> "termo sem evidência" (extras) e a cauda acusada', async () => {
    await dbRun(db, "UPDATE termos_responsabilidade_versao SET texto = REPLACE(texto, ' (sem multa)', '') WHERE tipo = 'FERRAMENTA' AND versao = 1");
    assert.strictEqual((await cadeia()).integra, true);
    await derrubar('evidencias_assinatura_almoxarifado');
    await dbRun(db, "DELETE FROM evidencias_assinatura_almoxarifado WHERE contexto = 'TERMO_FERRAMENTA' AND contexto_id = ?", [emp2.id]);
    const p = (await cadeia()).problemas.map((x) => [x.numero, x.motivo]);
    assert.ok(p.some(([n, m]) => n === emp2.termo.numero && m === 'termo sem evidência'), JSON.stringify(p));
    assert.ok(p.some(([, m]) => m === 'registro apagado no fim da cadeia'), JSON.stringify(p));
    assert.deepStrictEqual(await verificar(emp2.id), { integro: false, motivo: 'registro alterado' });
  });

  console.log(`\ntermoFerramentaVerificacao: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
