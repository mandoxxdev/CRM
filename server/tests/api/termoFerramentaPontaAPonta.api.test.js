/**
 * Etapa 180 (T4) — termo de responsabilidade de ferramenta ponta a ponta, TUDO PELA ROTA (o que a tela faz, na ordem em que faz):
 *
 *   POST /termos/FERRAMENTA (admin cria a v2 do texto) -> GET /termos/FERRAMENTA (o que o modal mostra) -> POST /ferramentas
 *   -> colaborador ativo -> GET /aux/colaboradores -> POST /ferramentas/:id/emprestar (multipart com PNG REAL, matricula, termo_versao 2)
 *   -> GET /emprestimos (tem_termo) -> GET …/termo (texto da v2, fotografia) -> GET arquivo_url (a URL assinada abre, MESMOS bytes)
 *   -> /verificar integro -> PUT /ferramentas/:id mudando numero_serie -> continua integro e mostra a fotografia -> devolucao
 *   -> continua integro -> entrega de EPI no meio -> /evidencias/cadeia/verificar integra com os dois contextos -> 1 byte do PNG do
 *   termo trocado -> /verificar e cadeia acusam -> novo emprestimo da mesma ferramenta com a v3 criada no meio (409, depois 201).
 *
 * Colaborador: `colaboradores` e tabela CORE (modulo Operacional) — o harness so tem a DDL, nao a rota; vai direto no SQLite
 * (molde epiPontaAPonta).
 *
 * Com `TERMO_T4_FORMAS=1` imprime as formas reais das respostas (a conferencia do front campo a campo).
 *
 * Executar: cd server && node tests/api/termoFerramentaPontaAPonta.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}
const FORMAS = process.env.TERMO_T4_FORMAS === '1';
const forma = (rotulo, v) => { if (FORMAS) console.log(`    [forma] ${rotulo}: ${JSON.stringify(v)}`); };

// ── PNG real (o que o canvas.toBlob da tela manda): 240x80 RGBA, fundo transparente, um traco preto (molde epiPontaAPonta) ──
const CRC_TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngDeAssinatura(w = 240, h = 80, fase = 0) {
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const linha = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      const yCurva = Math.round(h / 2 + Math.sin((x + fase) / 15) * (h / 4));
      if (Math.abs(y - yCurva) <= 1) linha[1 + x * 4 + 3] = 255;
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(linhas))), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const binario = (res, cb) => { const partes = []; res.on('data', (c) => partes.push(c)); res.on('end', () => cb(null, Buffer.concat(partes))); };

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const TEXTO_V2 = 'Declaro que recebi a ferramenta descrita acima em perfeito estado e me responsabilizo pela guarda e devolucao.\n\n'
  + 'Em caso de perda ou dano por mau uso, autorizo a apuracao conforme a politica da empresa.';
const TEXTO_V3 = `${TEXTO_V2}\n\nClausula 3: a devolucao e feita no almoxarifado, ao almoxarife de turno.`;
const URL_ASSINATURA = /^\/api\/uploads\/almoxarifado\/assinatura-termo-[^/?]+\.png\?exp=\d+&sig=[0-9a-f]+$/;

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, uploadsAlmoxDir } = t;
  wrapDatabase(db);
  fs.mkdirSync(uploadsAlmoxDir, { recursive: true });
  const PNG = pngDeAssinatura();
  const PNG_2 = pngDeAssinatura(240, 80, 7);
  const ARQUIVOS_ANTES = new Set(fs.readdirSync(uploadsAlmoxDir));

  let vigenteTela; let ferramentaId; let colab; let emp; let termoResp; let arquivoNoDisco; let entregaEpi;
  const termoUrl = (id) => `/api/almoxarifado/ferramentas/emprestimos/${id}/termo`;
  const verificar = async (id) => {
    const r = await request(app).get(`${termoUrl(id)}/verificar`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const cadeia = async () => {
    const r = await request(app).get('/api/almoxarifado/evidencias/cadeia/verificar');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const emprestar = (versao, { png = PNG, chave } = {}) => request(app).post(`/api/almoxarifado/ferramentas/${ferramentaId}/emprestar`)
    .field('colaborador_id', String(colab.id))
    .field('confirmacao_matricula', ' m-t4-77 ') // o colaborador digita a propria (caixa e pontas nao contam, regua da 178)
    .field('termo_versao', String(versao))
    .field('data_prevista_devolucao', '2031-03-15')
    .field('observacoes', 'integracao T4')
    .field('chave_idempotencia', chave || crypto.randomUUID())
    .field('colaborador_nome', 'NOME DIGITADO IGNORADO') // RN-180.03: o snapshot e do cadastro
    .set('User-Agent', 'TabletFerramenta-T4/1.0')
    .attach('assinatura', png, { filename: 'assinatura.png', contentType: 'image/png' });

  await test('[RN-180.02] admin cria a v2 pela rota (versao_base 1); o GET que o modal faz devolve a v2 vigente, nao provisoria', async () => {
    const antes = await request(app).get('/api/almoxarifado/termos/FERRAMENTA');
    assert.strictEqual(antes.status, 200);
    assert.strictEqual(antes.body.vigente.versao, 1);
    assert.strictEqual(antes.body.vigente.provisorio, true);
    const cri = await request(app).post('/api/almoxarifado/termos/FERRAMENTA').send({ texto: `  ${TEXTO_V2}  `, versao_base: 1 });
    assert.strictEqual(cri.status, 201, JSON.stringify(cri.body));
    forma('POST /termos/FERRAMENTA 201', cri.body);
    assert.deepStrictEqual(Object.keys(cri.body).sort(), ['criado_em', 'criado_por_nome', 'provisorio', 'texto', 'versao']);
    assert.strictEqual(cri.body.versao, 2);
    assert.strictEqual(cri.body.texto, TEXTO_V2, 'o texto gravado e o aparado');
    assert.strictEqual(cri.body.provisorio, false);
    assert.strictEqual(cri.body.criado_por_nome, 'Admin Teste');
    const r = await request(app).get('/api/almoxarifado/termos/FERRAMENTA');
    forma('GET /termos/FERRAMENTA', r.body);
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['historico', 'vigente']);
    vigenteTela = r.body.vigente;
    assert.deepStrictEqual(vigenteTela, cri.body);
    assert.deepStrictEqual(r.body.historico.map((h) => h.versao), [2, 1]);
  });

  await test('cadastro da ferramenta pela rota e colaborador ativo na lista aux', async () => {
    const r = await request(app).post('/api/almoxarifado/ferramentas').send({
      codigo_patrimonio: 'PAT-T4-01', nome: 'Torquimetro T4', tipo: 'Instrumento', numero_serie: 'NS-ORIGINAL', exige_calibracao: false });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    ferramentaId = r.body.id;
    const lista = await request(app).get('/api/almoxarifado/ferramentas');
    const f = lista.body.find((x) => x.id === ferramentaId);
    assert.strictEqual(f.status, 'DISPONIVEL');
    const id = (await dbRun(db, 'INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES (?,?,?,?,?)',
      ['MARIA DO TORQUE', 'M-T4-77', '987.654.321-00', 'Ativo', 'Montagem'])).lastID;
    const aux = await request(app).get('/api/almoxarifado/aux/colaboradores');
    assert.strictEqual(aux.status, 200);
    colab = aux.body.find((c) => c.id === id);
    forma('GET /aux/colaboradores item', colab);
    assert.deepStrictEqual(colab, { id, nome: 'MARIA DO TORQUE', matricula: 'M-T4-77', setor: 'Montagem' });
  });

  await test('[RN-180.04] POST /emprestar multipart com PNG real e termo_versao 2 -> 201 no contrato; o arquivo e o PNG enviado', async () => {
    const r = await emprestar(vigenteTela.versao);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    forma('POST /emprestar 201', r.body);
    emp = r.body;
    assert.deepStrictEqual(Object.keys(emp).sort(), ['id', 'termo']);
    assert.deepStrictEqual(Object.keys(emp.termo).sort(), ['evidencia', 'numero', 'versao']);
    assert.deepStrictEqual(Object.keys(emp.termo.evidencia).sort(), ['arquivo_sha256', 'arquivo_url', 'criado_em', 'id', 'registro_sha256']);
    assert.match(emp.termo.numero, /^TERMO-/);
    assert.strictEqual(emp.termo.versao, 2);
    assert.strictEqual(emp.termo.evidencia.arquivo_sha256, sha256(PNG));
    assert.match(emp.termo.evidencia.registro_sha256, /^[0-9a-f]{64}$/);
    assert.match(emp.termo.evidencia.arquivo_url, URL_ASSINATURA);
    arquivoNoDisco = path.join(uploadsAlmoxDir, path.basename(emp.termo.evidencia.arquivo_url.split('?')[0]));
    assert.ok(fs.readFileSync(arquivoNoDisco).equals(PNG), 'o arquivo gravado nao e o PNG enviado');
    const f = (await request(app).get('/api/almoxarifado/ferramentas')).body.find((x) => x.id === ferramentaId);
    assert.strictEqual(f.status, 'EMPRESTADA');
    assert.strictEqual(f.emprestimo_aberto.id, emp.id);
  });

  await test('[RN-180.06] GET /emprestimos: a linha tem tem_termo true e o nome do CADASTRO (o digitado foi ignorado)', async () => {
    const r = await request(app).get('/api/almoxarifado/emprestimos');
    assert.strictEqual(r.status, 200);
    const linha = r.body.find((e) => e.id === emp.id);
    forma('GET /emprestimos item', linha);
    assert.strictEqual(linha.tem_termo, true);
    assert.strictEqual(linha.colaborador_nome, 'MARIA DO TORQUE');
    assert.strictEqual(linha.colaborador_id, colab.id);
    assert.strictEqual(linha.setor, 'Montagem');
    assert.strictEqual(linha.status, 'EMPRESTADA');
    assert.strictEqual(linha.codigo_patrimonio, 'PAT-T4-01');
    assert.strictEqual(linha.ferramenta_nome, 'Torquimetro T4');
    assert.strictEqual(linha.data_prevista_devolucao, '2031-03-15');
    assert.strictEqual(linha.observacoes, 'integracao T4');
  });

  await test('[RN-180.05] GET …/termo: texto DA v2, fotografia, colaborador e evidencia (confirmado_por_matricula e FLAG 1, nao a matricula)', async () => {
    const r = await request(app).get(termoUrl(emp.id));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    termoResp = r.body;
    forma('GET …/termo', termoResp);
    assert.deepStrictEqual(Object.keys(termoResp).sort(), ['emprestimo', 'evidencia', 'termo']);
    assert.deepStrictEqual(Object.keys(termoResp.emprestimo).sort(), ['codigo_patrimonio', 'data_devolucao_real', 'data_prevista_devolucao',
      'data_retirada', 'ferramenta_id', 'ferramenta_nome', 'id', 'status']);
    assert.deepStrictEqual(Object.keys(termoResp.termo).sort(), ['colaborador', 'criado_em', 'criado_por_nome', 'data_prevista_devolucao',
      'ferramenta', 'numero', 'provisorio', 'texto', 'texto_sha256', 'versao']);
    assert.deepStrictEqual(Object.keys(termoResp.evidencia).sort(), ['arquivo_sha256', 'arquivo_url', 'confirmado_por_matricula', 'criado_em',
      'id', 'registro_sha256', 'sequencia']);
    assert.strictEqual(termoResp.termo.numero, emp.termo.numero);
    assert.strictEqual(termoResp.termo.versao, 2);
    assert.strictEqual(termoResp.termo.texto, TEXTO_V2);
    assert.strictEqual(termoResp.termo.texto_sha256, sha256(TEXTO_V2));
    assert.strictEqual(termoResp.termo.provisorio, false);
    assert.deepStrictEqual(termoResp.termo.ferramenta, { id: ferramentaId, codigo_patrimonio: 'PAT-T4-01', numero_serie: 'NS-ORIGINAL', nome: 'Torquimetro T4' });
    assert.deepStrictEqual(termoResp.termo.colaborador, { id: colab.id, nome: 'MARIA DO TORQUE', matricula: 'M-T4-77', setor: 'Montagem' });
    assert.strictEqual(termoResp.termo.data_prevista_devolucao, '2031-03-15');
    assert.strictEqual(termoResp.termo.criado_por_nome, 'Admin Teste');
    assert.match(termoResp.termo.criado_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    assert.strictEqual(termoResp.evidencia.registro_sha256, emp.termo.evidencia.registro_sha256);
    // A tela/PDF NAO pode imprimir este campo como "a matricula digitada": e 1 (conferida), a digitada nao e gravada.
    assert.strictEqual(termoResp.evidencia.confirmado_por_matricula, 1);
    assert.strictEqual(termoResp.evidencia.sequencia, 1);
    assert.match(termoResp.evidencia.arquivo_url, URL_ASSINATURA);
    assert.strictEqual(termoResp.emprestimo.status, 'EMPRESTADA');
    assert.strictEqual(termoResp.emprestimo.data_devolucao_real, null);
    const ev = await dbGet(db, 'SELECT ip, user_agent, contexto FROM evidencias_assinatura_almoxarifado WHERE id = ?', [termoResp.evidencia.id]);
    assert.strictEqual(ev.contexto, 'TERMO_FERRAMENTA');
    assert.strictEqual(ev.user_agent, 'TabletFerramenta-T4/1.0');
  });

  await test('GET arquivo_url (o <img> do modal e o fetch do PDF, sem sessao) -> 200 image/png com os MESMOS bytes; sem sig -> 404', async () => {
    const url = termoResp.evidencia.arquivo_url;
    const res = await request(app).get(url).buffer(true).parse(binario);
    assert.strictEqual(res.status, 200, `status ${res.status}`);
    assert.match(res.headers['content-type'], /^image\/png/);
    assert.ok(Buffer.isBuffer(res.body) && res.body.equals(PNG), 'os bytes servidos nao sao os da assinatura');
    assert.strictEqual(sha256(res.body), termoResp.evidencia.arquivo_sha256);
    assert.strictEqual((await request(app).get(url.split('?')[0])).status, 404);
    assert.strictEqual((await request(app).get(url.replace(/sig=[0-9a-f]/, (s) => (s.endsWith('0') ? 'sig=1' : 'sig=0')))).status, 404);
  });

  await test('[RN-180.05] /verificar -> { integro: true }', async () => {
    assert.deepStrictEqual(await verificar(emp.id), { integro: true });
  });

  await test('[C1] PUT /ferramentas/:id mudando numero_serie -> continua integro; o termo mostra a FOTOGRAFIA (serie original)', async () => {
    const r = await request(app).put(`/api/almoxarifado/ferramentas/${ferramentaId}`).send({ numero_serie: 'NS-TROCADA-NO-PUT' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const viva = (await request(app).get('/api/almoxarifado/ferramentas')).body.find((x) => x.id === ferramentaId);
    assert.strictEqual(viva.numero_serie, 'NS-TROCADA-NO-PUT', 'o PUT nao mudou a ferramenta viva — o passo nao prova nada');
    assert.deepStrictEqual(await verificar(emp.id), { integro: true });
    const termo = (await request(app).get(termoUrl(emp.id))).body.termo;
    assert.strictEqual(termo.ferramenta.numero_serie, 'NS-ORIGINAL');
    assert.strictEqual((await cadeia()).integra, true);
  });

  await test('[C1] devolucao pela rota -> continua integro; o termo mostra o emprestimo DEVOLVIDA', async () => {
    const r = await request(app).post(`/api/almoxarifado/emprestimos/${emp.id}/devolver`).send({ observacoes: 'voltou ok' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await verificar(emp.id), { integro: true });
    const e = (await request(app).get(termoUrl(emp.id))).body.emprestimo;
    assert.strictEqual(e.status, 'DEVOLVIDA');
    assert.ok(e.data_devolucao_real, 'sem data de devolucao');
    const f = (await request(app).get('/api/almoxarifado/ferramentas')).body.find((x) => x.id === ferramentaId);
    assert.strictEqual(f.status, 'DISPONIVEL');
  });

  await test('[RN-180.01] entrega de EPI no meio (pela rota) -> /evidencias/cadeia/verificar integra com os DOIS contextos', async () => {
    const fam = await dbGet(db, 'SELECT id FROM familias_material_almoxarifado WHERE parent_id IS NULL AND ativo = 1 ORDER BY id LIMIT 1');
    const cri = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'EPI-T4-OCULOS', nome: 'Oculos T4', familia_id: fam.id, categoria: 'EPIs', unidade_medida: 'UN', ca_numero: '4444' });
    assert.strictEqual(cri.status, 201, JSON.stringify(cri.body));
    const mat = await dbGet(db, "SELECT id FROM materiais_almoxarifado WHERE codigo = 'EPI-T4-OCULOS'");
    assert.strictEqual((await request(app).put(`/api/almoxarifado/materiais/${mat.id}`).send({ ca_validade: '2099-06-30' })).status, 200);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat.id, tipo: 'ENTRADA', quantidade: 5, motivo: 'carga T4' });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));
    const r = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(colab.id)).field('material_id', String(mat.id)).field('quantidade', '1')
      .field('confirmacao_matricula', 'M-T4-77')
      .attach('assinatura', PNG_2, { filename: 'assinatura.png', contentType: 'image/png' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    entregaEpi = r.body;
    const c = await cadeia();
    forma('GET /evidencias/cadeia/verificar', c);
    assert.strictEqual(c.integra, true, JSON.stringify(c.problemas));
    assert.deepStrictEqual(c.problemas, []);
    assert.strictEqual(c.total, 2);
    const ctx = await dbAll(db, 'SELECT contexto, sequencia FROM evidencias_assinatura_almoxarifado ORDER BY sequencia');
    assert.deepStrictEqual(ctx.map((x) => [x.sequencia, x.contexto]), [[1, 'TERMO_FERRAMENTA'], [2, 'ENTREGA_EPI']]);
    assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${entregaEpi.id}/verificar`)).body, { integro: true });
    assert.deepStrictEqual(await verificar(emp.id), { integro: true }, 'o termo depois do EPI (o elo com o posterior)');
  });

  await test('[RN-180.05] 1 byte trocado no PNG do termo -> /verificar e a cadeia acusam "arquivo alterado" (so o termo)', async () => {
    const bytes = fs.readFileSync(arquivoNoDisco);
    const i = Math.floor(bytes.length / 2);
    bytes[i] ^= 0x01;
    fs.writeFileSync(arquivoNoDisco, bytes);
    try {
      assert.deepStrictEqual(await verificar(emp.id), { integro: false, motivo: 'arquivo alterado' });
      const c = await cadeia();
      assert.strictEqual(c.integra, false);
      assert.deepStrictEqual(c.problemas.map((p) => [p.numero, p.motivo]), [[emp.termo.numero, 'arquivo alterado']]);
      assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${entregaEpi.id}/verificar`)).body, { integro: true });
    } finally {
      bytes[i] ^= 0x01;
      fs.writeFileSync(arquivoNoDisco, bytes);
    }
    assert.deepStrictEqual(await verificar(emp.id), { integro: true }, 'o byte devolvido nao voltou a dar integro');
    assert.strictEqual((await cadeia()).integra, true);
  });

  await test('[RN-180.04] novo emprestimo da mesma ferramenta: a tela leu a v2, o admin salva a v3 no meio -> 409; relida a v3 -> 201', async () => {
    const tela = (await request(app).get('/api/almoxarifado/termos/FERRAMENTA')).body.vigente;
    assert.strictEqual(tela.versao, 2);
    const v3 = await request(app).post('/api/almoxarifado/termos/FERRAMENTA').send({ texto: TEXTO_V3, versao_base: 2 });
    assert.strictEqual(v3.status, 201, JSON.stringify(v3.body));
    const arquivosAntes = new Set(fs.readdirSync(uploadsAlmoxDir));
    const r409 = await emprestar(tela.versao, { png: PNG_2 });
    assert.strictEqual(r409.status, 409, JSON.stringify(r409.body));
    assert.strictEqual(r409.body.error, 'O texto do termo mudou (versão 3) — releia e assine de novo');
    assert.deepStrictEqual(fs.readdirSync(uploadsAlmoxDir).filter((f) => !arquivosAntes.has(f)), [], 'o PNG do 409 ficou orfao');
    const f = (await request(app).get('/api/almoxarifado/ferramentas')).body.find((x) => x.id === ferramentaId);
    assert.strictEqual(f.status, 'DISPONIVEL', 'o 409 deixou a ferramenta presa');
    const relida = (await request(app).get('/api/almoxarifado/termos/FERRAMENTA')).body.vigente;
    assert.strictEqual(relida.versao, 3);
    const r201 = await emprestar(relida.versao, { png: PNG_2 });
    assert.strictEqual(r201.status, 201, JSON.stringify(r201.body));
    assert.strictEqual(r201.body.termo.versao, 3);
    const novo = (await request(app).get(termoUrl(r201.body.id))).body.termo;
    assert.strictEqual(novo.texto, TEXTO_V3);
    assert.strictEqual(novo.ferramenta.numero_serie, 'NS-TROCADA-NO-PUT', 'a fotografia do 2o termo e a ferramenta de AGORA');
    const velho = (await request(app).get(termoUrl(emp.id))).body.termo;
    assert.strictEqual(velho.versao, 2);
    assert.strictEqual(velho.texto, TEXTO_V2);
    assert.strictEqual(velho.ferramenta.numero_serie, 'NS-ORIGINAL');
    const lista = (await request(app).get(`/api/almoxarifado/emprestimos?ferramenta_id=${ferramentaId}`)).body;
    assert.deepStrictEqual(lista.map((e) => [e.id, e.status, e.tem_termo]).sort((a, b) => a[0] - b[0]),
      [[emp.id, 'DEVOLVIDA', true], [r201.body.id, 'EMPRESTADA', true]]);
    const c = await cadeia();
    assert.strictEqual(c.integra, true, JSON.stringify(c.problemas));
    assert.strictEqual(c.total, 3);
    assert.deepStrictEqual(await verificar(r201.body.id), { integro: true });
    assert.deepStrictEqual(await verificar(emp.id), { integro: true });
    // So os tres PNGs dos atos que deram certo ficaram em disco (dois termos e um EPI).
    const novos = fs.readdirSync(uploadsAlmoxDir).filter((x) => !ARQUIVOS_ANTES.has(x)).sort();
    assert.strictEqual(novos.length, 3, novos.join(', '));
    assert.strictEqual(novos.filter((x) => x.startsWith('assinatura-termo-')).length, 2, novos.join(', '));
  });

  await t.close();
  console.log(`\ntermoFerramentaPontaAPonta: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
