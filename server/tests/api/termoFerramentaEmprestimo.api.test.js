/**
 * Etapa 180 — T2, RN-180.03/04 (+ C2, C3, I3 e menores da revisao da Fase 2): o emprestimo de ferramenta com o termo assinado.
 *
 * Colaborador do cadastro (ativo, com matricula confirmada), PNG de verdade, a versao do termo que a tela mostrou; claim +
 * emprestimo + fotografia do termo + evidencia numa transacao so, na fila da cadeia. Recusas limpam o PNG e nao gravam nada.
 *
 * Executar: cd server && node tests/api/termoFerramentaEmprestimo.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const termoService = require('../../services/almoxarifado/termoFerramentaService');
const { emprestarComTermo, colaboradorDoCadastro, PNG_1PX } = require('../helpers/termoFerramenta');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const PRODUCAO = { id: 3, nome: 'Chao', email: 'chao@test.com' };

(async () => {
  const t = await createTestApp({ user: ADMIN });
  wrapDatabase(t.db);
  const { app, db, uploadsAlmoxDir } = t;
  fs.mkdirSync(uploadsAlmoxDir, { recursive: true });
  let seq = 0;
  const novaFerramenta = async (extra = {}) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO ferramentas_almoxarifado (codigo_patrimonio, nome, status, exige_calibracao, numero_serie)
      VALUES (?, ?, ?, ?, ?)`, [`PAT-T-${seq}`, `Torquimetro ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0,
      `NS-${seq}`])).lastID;
  };
  const pngs = () => fs.readdirSync(uploadsAlmoxDir).filter((f) => f.startsWith('assinatura-termo-')).length;
  const contagem = async () => ({
    emprestimos: (await dbGet(db, 'SELECT COUNT(*) AS n FROM emprestimos_ferramenta_almoxarifado')).n,
    termos: (await dbGet(db, 'SELECT COUNT(*) AS n FROM termos_emprestimo_ferramenta')).n,
    evidencias: (await dbGet(db, 'SELECT COUNT(*) AS n FROM evidencias_assinatura_almoxarifado')).n,
    pngs: pngs(),
  });
  /** Uma recusa: o status e a literal, e NADA mudou (nem linha nem PNG; a ferramenta continua como estava). */
  const recusa = async (fid, campos, status, mensagem) => {
    const antes = await contagem();
    const statusAntes = (await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid])).status;
    const r = await emprestarComTermo(app, db, fid, campos);
    assert.strictEqual(r.status, status, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, mensagem);
    assert.deepStrictEqual(await contagem(), antes, 'a recusa gravou alguma coisa (ou deixou o PNG)');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid])).status, statusAntes);
  };

  const anaCad = await colaboradorDoCadastro(db, 'ANA DO CADASTRO', { setor: 'Caldeiraria' });

  await test('[RN-180.03/04] 201: colaborador do cadastro (o nome digitado e ignorado), fotografia do termo e evidencia', async () => {
    const fid = await novaFerramenta();
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .field('colaborador_id', String(anaCad.id)).field('confirmacao_matricula', ` ${anaCad.matricula.toLowerCase()} `)
      .field('termo_versao', '1').field('colaborador_nome', 'NOME DIGITADO').field('setor', 'SETOR DIGITADO')
      .field('data_prevista_devolucao', '2030-05-01').field('observacoes', 'obra 12')
      .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.termo.numero, /^TERMO-/);
    assert.strictEqual(r.body.termo.versao, 1);
    assert.match(r.body.termo.evidencia.registro_sha256, /^[0-9a-f]{64}$/);
    assert.ok(r.body.termo.evidencia.arquivo_url);
    const emp = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual([emp.colaborador_id, emp.colaborador_nome, emp.setor, emp.status, emp.data_prevista_devolucao, emp.observacoes],
      [anaCad.id, 'ANA DO CADASTRO', 'Caldeiraria', 'EMPRESTADA', '2030-05-01', 'obra 12']);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid])).status, 'EMPRESTADA');
    const termo = await dbGet(db, 'SELECT * FROM termos_emprestimo_ferramenta WHERE emprestimo_id = ?', [r.body.id]);
    assert.deepStrictEqual(
      [termo.numero, termo.ferramenta_id, termo.ferramenta_codigo_patrimonio, termo.ferramenta_numero_serie, termo.colaborador_nome,
        termo.matricula, termo.setor, termo.termo_versao, termo.criado_por_nome, termo.data_prevista_devolucao],
      [r.body.termo.numero, fid, `PAT-T-${seq}`, `NS-${seq}`, 'ANA DO CADASTRO', anaCad.matricula, 'Caldeiraria', 1, 'Admin Teste', '2030-05-01']);
    const ev = await dbGet(db, "SELECT * FROM evidencias_assinatura_almoxarifado WHERE contexto = 'TERMO_FERRAMENTA' AND contexto_id = ?", [r.body.id]);
    assert.ok(ev, 'sem evidencia');
    assert.strictEqual(ev.confirmado_por_matricula, 1);
    assert.strictEqual(ev.registro_sha256, r.body.termo.evidencia.registro_sha256);
    assert.strictEqual(pngs(), 1);
  });

  await test('[RN-180.03] colaborador: ausente, inexistente, inativo e sem matricula no cadastro -> 400 literal, nada gravado', async () => {
    const fid = await novaFerramenta();
    await recusa(fid, { colaborador_id: '', confirmacao_matricula: 'X' }, 400, 'O colaborador é obrigatório');
    await recusa(fid, { colaborador_id: 999999, confirmacao_matricula: 'X' }, 400, 'Colaborador #999999 não encontrado');
    const inativo = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, status) VALUES ('BETO INATIVO', 'MB1', 'inativo')")).lastID;
    await recusa(fid, { colaborador_id: inativo, confirmacao_matricula: 'MB1' }, 400, 'Colaborador BETO INATIVO não está ativo');
    const semMat = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, status) VALUES ('CAIO SEM MATRICULA', NULL, 'ativo')")).lastID;
    await recusa(fid, { colaborador_id: semMat, confirmacao_matricula: 'X' }, 400,
      'Colaborador CAIO SEM MATRICULA sem matrícula cadastrada — não é possível confirmar a identidade');
  });

  await test('[RN-180.04] matricula errada ou vazia -> 400 literal, nada gravado', async () => {
    const fid = await novaFerramenta();
    await recusa(fid, { colaborador_id: anaCad.id, confirmacao_matricula: 'OUTRA' }, 400, 'A matrícula informada não confere com a do colaborador');
    await recusa(fid, { colaborador_id: anaCad.id, confirmacao_matricula: '' }, 400, 'O colaborador deve digitar a própria matrícula para assinar o termo');
  });

  await test('[RN-180.04] assinatura: ausente, bytes que nao sao PNG, MIME errado -> 400 literal, nada gravado', async () => {
    const fid = await novaFerramenta();
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO', semAssinatura: true }, 400, 'A assinatura do colaborador é obrigatória');
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO', assinatura: Buffer.from('nao sou png') }, 400, 'A assinatura deve ser uma imagem PNG');
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO', contentType: 'image/jpeg' }, 400, 'A assinatura deve ser uma imagem PNG');
  });

  await test('[RN-180.04] termo_versao ausente -> 400; diferente da vigente -> 409 literal com a versao vigente', async () => {
    const fid = await novaFerramenta();
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO', termo_versao: '' }, 400, 'A versão do termo é obrigatória');
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO', termo_versao: 7 }, 409, 'O texto do termo mudou (versão 1) — releia e assine de novo');
  });

  await test('[menores] calibracao vencida continua bloqueando (literal da 9b), e o PNG e limpo', async () => {
    const fid = await novaFerramenta({ exige_calibracao: 1 });
    await dbRun(db, "INSERT INTO calibracoes_ferramenta_almoxarifado (ferramenta_id, data_calibracao, data_validade) VALUES (?, '2020-01-01', '2020-12-31')", [fid]);
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO' }, 400, 'Ferramenta com calibração vencida ou sem calibração registrada');
  });

  await test('[RN-02 9b] ferramenta fora de DISPONIVEL: a literal de sempre com o status, nada gravado', async () => {
    const fid = await novaFerramenta({ status: 'BLOQUEADA' });
    await recusa(fid, { colaborador_nome: 'ANA DO CADASTRO' }, 400, 'Ferramenta não está disponível (status atual: BLOQUEADA)');
  });

  await test('[I3] idempotencia ANTES do claim: o reenvio com a mesma chave devolve o emprestimo (200, reutilizada) e nao grava', async () => {
    const fid = await novaFerramenta();
    const chave = 'chave-termo-0001';
    const a = await emprestarComTermo(app, db, fid, { colaborador_nome: 'ANA DO CADASTRO', chave_idempotencia: chave }).expect(201);
    const antes = await contagem();
    const b = await emprestarComTermo(app, db, fid, { colaborador_nome: 'ANA DO CADASTRO', chave_idempotencia: chave }).expect(200);
    assert.strictEqual(b.body.reutilizada, true);
    assert.strictEqual(b.body.id, a.body.id);
    assert.strictEqual(b.body.termo.numero, a.body.termo.numero);
    assert.strictEqual(b.body.termo.evidencia.registro_sha256, a.body.termo.evidencia.registro_sha256);
    assert.deepStrictEqual(await contagem(), antes, 'o reenvio gravou (ou deixou o PNG duplicado)');
    const outro = await colaboradorDoCadastro(db, 'DUDA OUTRA');
    const r = await emprestarComTermo(app, db, fid, { colaborador_nome: 'DUDA OUTRA', chave_idempotencia: chave });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Chave de idempotência já usada em outro empréstimo');
    assert.ok(outro.id);
    assert.deepStrictEqual(await contagem(), antes);
  });

  await test('[C2] corrida: dois emprestimos da mesma ferramenta (disparados do teste, segurados no gancho) -> um 201, um 409; nada orfao', async () => {
    const fid = await novaFerramenta();
    await colaboradorDoCadastro(db, 'EVA CORRIDA');
    const antes = await contagem();
    let chegaram = 0; let soltar; const barreira = new Promise((r) => { soltar = r; });
    termoService.ganchos.antesDaGravacao = async () => { chegaram += 1; if (chegaram === 2) soltar(); await barreira; };
    let a; let b;
    try {
      [a, b] = await Promise.all([
        emprestarComTermo(app, db, fid, { colaborador_nome: 'ANA DO CADASTRO' }),
        emprestarComTermo(app, db, fid, { colaborador_nome: 'EVA CORRIDA' }),
      ]);
    } finally { termoService.ganchos.antesDaGravacao = null; }
    assert.strictEqual(chegaram, 2, 'as duas nao passaram das conferencias (a corrida nao aconteceu)');
    assert.deepStrictEqual([a.status, b.status].sort(), [201, 409], JSON.stringify([a.body, b.body]));
    const perdedor = a.status === 409 ? a : b;
    assert.strictEqual(perdedor.body.error, 'A ferramenta não está disponível');
    const depois = await contagem();
    assert.deepStrictEqual(depois, { emprestimos: antes.emprestimos + 1, termos: antes.termos + 1, evidencias: antes.evidencias + 1, pngs: antes.pngs + 1 });
    const abertos = await dbAll(db, "SELECT id FROM emprestimos_ferramenta_almoxarifado WHERE ferramenta_id = ? AND status = 'EMPRESTADA'", [fid]);
    assert.strictEqual(abertos.length, 1);
    const orfaos = await dbGet(db, `SELECT COUNT(*) AS n FROM evidencias_assinatura_almoxarifado v WHERE v.contexto = 'TERMO_FERRAMENTA'
      AND NOT EXISTS (SELECT 1 FROM termos_emprestimo_ferramenta t WHERE t.emprestimo_id = v.contexto_id)`);
    assert.strictEqual(orfaos.n, 0);
    const c = await request(app).get('/api/almoxarifado/evidencias/cadeia/verificar');
    assert.strictEqual(c.body.integra, true, JSON.stringify(c.body.problemas));
  });

  await test('[menores] a versao trocada NO MEIO (depois das conferencias, antes da transacao) -> 409 da versao; nada gravado, PNG limpo', async () => {
    const fid = await novaFerramenta();
    const antes = await contagem();
    let chegou; const noGancho = new Promise((r) => { chegou = r; });
    let soltar; const barreira = new Promise((r) => { soltar = r; });
    termoService.ganchos.antesDaGravacao = async () => { chegou(); await barreira; };
    let r;
    try {
      const envio = emprestarComTermo(app, db, fid, { colaborador_nome: 'ANA DO CADASTRO' }).then((x) => x);
      await noGancho;
      const v = await request(app).post('/api/almoxarifado/termos/FERRAMENTA').send({ texto: 'Texto novo no meio do empréstimo' });
      assert.strictEqual(v.status, 201, JSON.stringify(v.body));
      soltar();
      r = await envio;
    } finally { termoService.ganchos.antesDaGravacao = null; soltar(); }
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'O texto do termo mudou (versão 2) — releia e assine de novo');
    assert.deepStrictEqual(await contagem(), antes);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [fid])).status, 'DISPONIVEL');
  });

  await test('[RN-180.04] PRODUCAO -> 403 antes do multer: nenhum PNG gravado', async () => {
    const fid = await novaFerramenta();
    const antes = await contagem();
    t.setUser(PRODUCAO);
    try {
      const r = await emprestarComTermo(app, db, fid, { colaborador_nome: 'ANA DO CADASTRO' });
      assert.strictEqual(r.status, 403);
    } finally { t.setUser(ADMIN); }
    assert.deepStrictEqual(await contagem(), antes);
  });

  await test('[C1] a fotografia do termo e append-only: UPDATE e DELETE recusados pelo banco', async () => {
    await assert.rejects(dbRun(db, "UPDATE termos_emprestimo_ferramenta SET colaborador_nome = 'x'"), /nao pode ser alterado/);
    await assert.rejects(dbRun(db, 'DELETE FROM termos_emprestimo_ferramenta'), /nao pode ser alterado/);
  });

  console.log(`\ntermoFerramentaEmprestimo: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
