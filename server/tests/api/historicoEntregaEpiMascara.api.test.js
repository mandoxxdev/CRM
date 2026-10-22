/**
 * Etapa 181 (Fase 5, revisao adversarial, I1) — quem recebeu qual EPI nao vaza pelo historico de movimentacoes.
 *
 * Ate a Fase 5 a SAIDA da entrega de EPI gravava a justificativa `Entrega de EPI a <nome> (<matricula>)` — e o historico
 * (relatorio `historico-movimentacoes`, acao null e exportavel; `GET /movimentacoes`; o historico, o extrato e o painel do
 * material) mostra a justificativa a qualquer usuario do modulo, enquanto a propria entrega e restrita a `entregar_epi`.
 *
 * Correcao (reversivel, letra B): (a) daqui para frente a justificativa e `Entrega de EPI <numero>` — sem nome nem matricula
 * (a pessoa continua na entrega, restrita); (b) as linhas ANTIGAS ficam como estao no banco (a justificativa nao entra no
 * HMAC da evidencia, mas reescrever o livro seria irreversivel) e sao MASCARADAS NA LEITURA para quem nao tem `entregar_epi`:
 * `^Entrega de EPI a .+$` -> `Entrega de EPI (dados do colaborador restritos)`.
 *
 * Executar: cd server && node tests/api/historicoEntregaEpiMascara.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
  }
}

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}
const getBinary = (req) => req.buffer().parse(binaryParser);
const planilha = (buf) => {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
};

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 4, nome: 'Gestor', role: 'user', email: 'gestor@test.com', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };

const ANTIGA = 'Entrega de EPI a JOAO DA SILVA (M-778)';
const MASCARA = 'Entrega de EPI (dados do colaborador restritos)';

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser } = t;
  wrapDatabase(db);

  const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-H-1', 'Luva de raspa', 'EPIs', 0, 1, 'CA-12345', '2099-01-01')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'ENTRADA', quantidade: 10, justificativa: 'carga inicial' });
  const col = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('MARIA NOVA', 'N-55', '99988877766', 'ativo', 'Solda')")).lastID;

  // A linha ANTIGA: a SAIDA como a entrega de EPI a gravava ate a Fase 5 da 181 (mesmo motor, mesmo texto).
  const antiga = await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: mat, tipo: 'SAIDA', quantidade: 1, documento_vinculado: 'EPI-ANTIGA-1', justificativa: ANTIGA,
  });
  // controle: uma saida comum cuja justificativa NAO casa a regua — nunca e mascarada.
  const comum = await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: mat, tipo: 'SAIDA', quantidade: 1, justificativa: 'Entrega de EPI conforme OS 12',
  });

  const ent = await request(app).post('/api/almoxarifado/epi/entregas')
    .field('colaborador_id', String(col)).field('material_id', String(mat)).field('quantidade', '1')
    .field('confirmacao_matricula', 'N-55').field('motivo', 'TROCA')
    .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
  assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));

  const justDe = (linhas, id) => {
    const l = linhas.find((x) => Number(x.id) === Number(id));
    assert.ok(l, `linha ${id} ausente: ${JSON.stringify(linhas.map((x) => x.id))}`);
    return l.justificativa;
  };

  await test('[a] entrega nova: a justificativa da SAIDA e "Entrega de EPI <numero>", sem nome nem matricula', async () => {
    const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [ent.body.movimentacao_id]);
    assert.strictEqual(mov.justificativa, `Entrega de EPI ${ent.body.numero}`);
    assert.ok(!mov.justificativa.includes('MARIA') && !mov.justificativa.includes('N-55'), mov.justificativa);
    // a pessoa continua na entrega (restrita)
    const e = await dbGet(db, 'SELECT colaborador_nome, matricula FROM entregas_epi_almoxarifado WHERE id = ?', [ent.body.id]);
    assert.deepStrictEqual([e.colaborador_nome, e.matricula], ['MARIA NOVA', 'N-55']);
  });

  await test('[b] a linha antiga continua gravada como estava (a mascara e so na leitura)', async () => {
    const mov = await dbGet(db, 'SELECT justificativa FROM movimentacoes_almoxarifado WHERE id = ?', [antiga.id]);
    assert.strictEqual(mov.justificativa, ANTIGA);
  });

  // As portas que mostram a justificativa da movimentacao a qualquer usuario do modulo.
  const PORTAS = [
    ['GET /movimentacoes', async () => (await request(app).get('/api/almoxarifado/movimentacoes')).body],
    ['GET /movimentacoes?material_id', async () => (await request(app).get(`/api/almoxarifado/movimentacoes?material_id=${mat}`)).body],
    ['GET /materiais/:id/historico', async () => (await request(app).get(`/api/almoxarifado/materiais/${mat}/historico`)).body],
    ['GET /materiais/:id/extrato', async () => (await request(app).get(`/api/almoxarifado/materiais/${mat}/extrato`)).body.movimentacoes],
    ['GET /dashboard (ultimas)', async () => (await request(app).get('/api/almoxarifado/dashboard')).body.ultimasMovimentacoes],
    ['GET /relatorio/movimentacoes-periodo', async () => (await request(app)
      .get('/api/almoxarifado/relatorio/movimentacoes-periodo?data_inicio=2000-01-01&data_fim=2999-12-31')).body],
    ['relatorio historico-movimentacoes', async () => (await request(app).get('/api/almoxarifado/relatorios/historico-movimentacoes')).body],
  ];

  for (const [quem, user] of [['PRODUCAO', PRODUCAO], ['GESTOR', GESTOR]]) {
    await test(`[b] ${quem}: a linha antiga vem mascarada em todas as portas; a comum e a nova ficam intactas`, async () => {
      setUser(user);
      for (const [porta, ler] of PORTAS) {
        const linhas = await ler();
        assert.ok(Array.isArray(linhas), `${porta}: ${JSON.stringify(linhas).slice(0, 300)}`);
        assert.strictEqual(justDe(linhas, antiga.id), MASCARA, porta);
        assert.ok(!JSON.stringify(linhas).includes('JOAO DA SILVA'), `${porta} vazou o nome`);
        assert.ok(!JSON.stringify(linhas).includes('M-778'), `${porta} vazou a matricula`);
        assert.strictEqual(justDe(linhas, comum.id), 'Entrega de EPI conforme OS 12', porta);
        assert.strictEqual(justDe(linhas, ent.body.movimentacao_id), `Entrega de EPI ${ent.body.numero}`, porta);
      }
      setUser(ADMIN);
    });
  }

  await test('[b] PRODUCAO: a exportacao do historico sai mascarada (e a comum, intacta)', async () => {
    setUser(PRODUCAO);
    const r = await getBinary(request(app).get('/api/almoxarifado/relatorios/historico-movimentacoes/export'));
    setUser(ADMIN);
    assert.strictEqual(r.status, 200, `export ${r.status}`);
    const linhas = planilha(r.body);
    const iJ = linhas[0].indexOf('Justificativa');
    assert.ok(iJ >= 0, JSON.stringify(linhas[0]));
    const textos = linhas.slice(1).map((l) => l[iJ]);
    assert.ok(textos.includes(MASCARA), JSON.stringify(textos));
    assert.ok(textos.includes('Entrega de EPI conforme OS 12'), JSON.stringify(textos));
    assert.ok(!JSON.stringify(linhas).includes('JOAO DA SILVA'), 'a planilha vazou o nome');
  });

  for (const [quem, user] of [['ALMOXARIFE', ALMOXARIFE], ['ADMIN', ADMIN]]) {
    await test(`[b] ${quem} (entregar_epi): ve o texto original em todas as portas e na exportacao`, async () => {
      setUser(user);
      for (const [porta, ler] of PORTAS) {
        assert.strictEqual(justDe(await ler(), antiga.id), ANTIGA, porta);
      }
      const r = await getBinary(request(app).get('/api/almoxarifado/relatorios/historico-movimentacoes/export'));
      assert.strictEqual(r.status, 200);
      const linhas = planilha(r.body);
      const iJ = linhas[0].indexOf('Justificativa');
      assert.ok(linhas.slice(1).some((l) => l[iJ] === ANTIGA), 'a planilha do almoxarife perdeu o texto');
      setUser(ADMIN);
    });
  }

  console.log(`\nhistoricoEntregaEpiMascara: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
