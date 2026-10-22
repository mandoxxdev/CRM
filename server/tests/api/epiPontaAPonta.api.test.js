/**
 * Etapa 178 (T3) — entrega de EPI ponta a ponta, TUDO PELA ROTA (o que o front faz, na ordem em que faz):
 *
 *   POST /materiais (CA) -> PUT /materiais/:id (validade do CA) -> GET /materiais (is_epi, a lista que a tela filtra)
 *   -> POST /movimentacoes (ENTRADA) -> colaborador ativo -> GET /aux/colaboradores
 *   -> POST /epi/entregas (multipart com PNG REAL, nao 1 px) -> GET /epi/entregas (contrato) -> GET /epi/ficha/:id (contrato, CPF
 *   mascarado) -> GET arquivo_url (o fetch que o PDF da ficha faz no navegador: a URL assinada abre e devolve os MESMOS bytes)
 *   -> /verificar integro -> 1 byte trocado no disco -> /verificar acusa -> estorno da saida pelo livro -> 400 literal
 *   -> colaborador excluido -> a ficha pelo snapshot (excluido: true) e a assinatura ainda abre.
 *
 * Colaborador: `colaboradores` e tabela CORE (modulo Operacional, `index.js`) — o harness so tem a DDL, nao a rota; criar e excluir
 * vao direto no SQLite (o mesmo que a exclusao do cadastro faz: DELETE da linha, sem FK, I2).
 *
 * Com `EPI_T3_FORMAS=1` imprime as formas reais das respostas (a conferencia do front, parte (b) da T3).
 *
 * Executar: cd server && node tests/api/epiPontaAPonta.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}
const FORMAS = process.env.EPI_T3_FORMAS === '1';
const forma = (rotulo, v) => { if (FORMAS) console.log(`    [forma] ${rotulo}: ${JSON.stringify(v)}`); };

// ── PNG real (o que o canvas.toBlob da tela manda): 240x80 RGBA, fundo transparente, um traco preto ──────────────
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
function pngDeAssinatura(w = 240, h = 80) {
  const linhas = [];
  for (let y = 0; y < h; y++) {
    const linha = Buffer.alloc(1 + w * 4); // filtro 0 + RGBA
    for (let x = 0; x < w; x++) {
      const yCurva = Math.round(h / 2 + Math.sin(x / 15) * (h / 4));
      if (Math.abs(y - yCurva) <= 1) linha[1 + x * 4 + 3] = 255; // preto opaco; o resto, transparente
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
const CHAVES_LISTA = ['ca_numero', 'ca_validade', 'colaborador_id', 'colaborador_nome', 'criado_em', 'entregue_por_nome', 'id',
  'material_codigo', 'material_id', 'material_nome', 'matricula', 'motivo', 'numero', 'quantidade', 'tamanho'];
const ESTORNO_EPI = 'Saída de entrega de EPI não pode ser estornada pelo livro — a ficha do colaborador continuaria dizendo que recebeu';

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, uploadsAlmoxDir } = t;
  wrapDatabase(db);
  const PNG = pngDeAssinatura();
  const ARQUIVOS_ANTES = new Set(fs.existsSync(uploadsAlmoxDir) ? fs.readdirSync(uploadsAlmoxDir) : []);

  let material; let colabId; let entrega; let linhaLista; let fichaAtiva; let arquivoNoDisco;

  await test('[RN-178.01/I4] cadastro pela rota: POST com CA, PUT com a validade; a lista (a que a tela filtra) traz is_epi e o CA', async () => {
    const fam = await dbGet(db, 'SELECT id FROM familias_material_almoxarifado WHERE parent_id IS NULL AND ativo = 1 ORDER BY id LIMIT 1');
    const cri = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'EPI-T3-LUVA', nome: 'Luva de vaqueta T3', familia_id: fam.id, categoria: 'EPIs', unidade_medida: 'PAR', ca_numero: ' 12345 ' });
    assert.strictEqual(cri.status, 201, JSON.stringify(cri.body));
    forma('POST /materiais 201', cri.body);
    const criado = await dbGet(db, "SELECT id FROM materiais_almoxarifado WHERE codigo = 'EPI-T3-LUVA'");
    const put = await request(app).put(`/api/almoxarifado/materiais/${criado.id}`).send({ ca_validade: '2099-06-30' });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    const lista = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(lista.status, 200);
    assert.ok(Array.isArray(lista.body), 'a tela espera ARRAY em /materiais (Array.isArray(mat.data))');
    material = lista.body.find((m) => m.id === criado.id);
    assert.ok(material, 'o EPI cadastrado nao veio na lista');
    forma('GET /materiais item', {
      id: material.id, codigo: material.codigo, is_epi: material.is_epi, ca_numero: material.ca_numero,
      ca_validade: material.ca_validade, controle_serie: material.controle_serie, controle_lote: material.controle_lote,
    });
    assert.strictEqual(material.is_epi, true);
    assert.strictEqual(material.ca_numero, '12345');
    assert.strictEqual(material.ca_validade, '2099-06-30');
    const det = await request(app).get(`/api/almoxarifado/materiais/${material.id}`);
    assert.strictEqual(det.body.is_epi, true);
    assert.strictEqual(det.body.ca_validade, '2099-06-30');
  });

  await test('entrada de estoque pela rota e colaborador ativo na lista aux (sem CPF)', async () => {
    const ent = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: material.id, tipo: 'ENTRADA', quantidade: 10, motivo: 'carga inicial' });
    assert.strictEqual(ent.status, 201, JSON.stringify(ent.body));
    colabId = (await dbRun(db, 'INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES (?,?,?,?,?)',
      ['JOSE DA SILVA T3', 'M-T3', '123.456.789-01', 'Ativo', 'Caldeiraria'])).lastID;
    const aux = await request(app).get('/api/almoxarifado/aux/colaboradores');
    assert.strictEqual(aux.status, 200);
    const c = aux.body.find((x) => x.id === colabId);
    forma('GET /aux/colaboradores item', c);
    assert.deepStrictEqual(c, { id: colabId, nome: 'JOSE DA SILVA T3', matricula: 'M-T3', setor: 'Caldeiraria' });
  });

  await test('[RN-178.05/06] POST /epi/entregas multipart com PNG real -> 201 no contrato; saldo 10 -> 8; hash do arquivo = o do PNG enviado', async () => {
    const res = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(colabId)).field('material_id', String(material.id)).field('quantidade', '2')
      .field('tamanho', 'G').field('motivo', 'PRIMEIRA_ENTREGA').field('observacao', 'integracao T3')
      .attach('assinatura', PNG, { filename: 'assinatura.png', contentType: 'image/png' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    forma('POST /epi/entregas 201', res.body);
    entrega = res.body;
    assert.deepStrictEqual(Object.keys(entrega).sort(), ['evidencia', 'id', 'movimentacao_id', 'numero']);
    assert.deepStrictEqual(Object.keys(entrega.evidencia).sort(), ['arquivo_sha256', 'arquivo_url', 'criado_em', 'id', 'registro_sha256']);
    assert.match(entrega.numero, /^EPI-/);
    assert.strictEqual(entrega.evidencia.arquivo_sha256, sha256(PNG));
    assert.match(entrega.evidencia.registro_sha256, /^[0-9a-f]{64}$/);
    assert.match(entrega.evidencia.criado_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    assert.match(entrega.evidencia.arquivo_url, /^\/api\/uploads\/almoxarifado\/assinatura-epi-[^/?]+\.png\?exp=\d+&sig=[0-9a-f]+$/);
    const det = await request(app).get(`/api/almoxarifado/materiais/${material.id}`);
    assert.strictEqual(Number(det.body.quantidade_atual), 8);
    const mov = await dbGet(db, 'SELECT tipo, quantidade, documento_vinculado FROM movimentacoes_almoxarifado WHERE id = ?', [entrega.movimentacao_id]);
    assert.strictEqual(mov.tipo, 'SAIDA');
    assert.strictEqual(Number(mov.quantidade), 2);
    assert.strictEqual(mov.documento_vinculado, entrega.numero);
    arquivoNoDisco = path.join(uploadsAlmoxDir, path.basename(entrega.evidencia.arquivo_url.split('?')[0]));
    assert.ok(fs.readFileSync(arquivoNoDisco).equals(PNG), 'o arquivo gravado nao e o PNG enviado');
  });

  await test('GET /epi/entregas -> as chaves congeladas, criado_em ISO UTC, ca_validade AAAA-MM-DD, quantidade numero', async () => {
    const res = await request(app).get(`/api/almoxarifado/epi/entregas?colaborador_id=${colabId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    linhaLista = res.body[0];
    forma('GET /epi/entregas item', linhaLista);
    assert.deepStrictEqual(Object.keys(linhaLista).sort(), CHAVES_LISTA);
    assert.strictEqual(linhaLista.id, entrega.id);
    assert.strictEqual(linhaLista.numero, entrega.numero);
    assert.strictEqual(linhaLista.criado_em, entrega.evidencia.criado_em);
    assert.strictEqual(linhaLista.colaborador_id, colabId);
    assert.strictEqual(linhaLista.colaborador_nome, 'JOSE DA SILVA T3');
    assert.strictEqual(linhaLista.matricula, 'M-T3');
    assert.strictEqual(linhaLista.material_codigo, 'EPI-T3-LUVA');
    assert.strictEqual(linhaLista.ca_numero, '12345');
    assert.strictEqual(linhaLista.ca_validade, '2099-06-30');
    assert.strictEqual(linhaLista.quantidade, 2);
    assert.strictEqual(linhaLista.tamanho, 'G');
    assert.strictEqual(linhaLista.motivo, 'PRIMEIRA_ENTREGA');
    assert.strictEqual(linhaLista.entregue_por_nome, 'Admin Teste');
    // o filtro de dia (de/ate) que a tela manda do <input type=date>: o dia de hoje acha a entrega
    const hoje = require('../../services/diaLocal').hojeLocalISO();
    assert.match(hoje, /^\d{4}-\d{2}-\d{2}$/);
    const dia = await request(app).get(`/api/almoxarifado/epi/entregas?de=${hoje}&ate=${hoje}&material_id=${material.id}`);
    assert.strictEqual(dia.body.length, 1, `de/ate=${hoje}`);
    const ontem = require('../../services/diaLocal').somarDiasISO(hoje, -1);
    const antes = await request(app).get(`/api/almoxarifado/epi/entregas?ate=${ontem}&material_id=${material.id}`);
    assert.strictEqual(antes.body.length, 0, `ate=${ontem} (o filtro de dia filtra)`);
  });

  await test('[RN-178.09] GET /epi/ficha/:id -> colaborador com CPF mascarado, excluido:false; entregas = lista + arquivo_url + registro_sha256', async () => {
    const res = await request(app).get(`/api/almoxarifado/epi/ficha/${colabId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    fichaAtiva = res.body;
    forma('GET /epi/ficha', fichaAtiva);
    assert.deepStrictEqual(fichaAtiva.colaborador, {
      id: colabId, nome: 'JOSE DA SILVA T3', matricula: 'M-T3', setor: 'Caldeiraria', cpf_mascarado: '***.***.***-01', excluido: false });
    assert.ok(!JSON.stringify(fichaAtiva).includes('123.456.789'), 'CPF completo vazou na ficha');
    assert.strictEqual(fichaAtiva.entregas.length, 1);
    const e = fichaAtiva.entregas[0];
    assert.deepStrictEqual(Object.keys(e).sort(), [...CHAVES_LISTA, 'arquivo_url', 'registro_sha256'].sort());
    assert.strictEqual(e.registro_sha256, entrega.evidencia.registro_sha256);
    assert.match(e.arquivo_url, /^\/api\/uploads\/almoxarifado\/assinatura-epi-[^/?]+\.png\?exp=\d+&sig=[0-9a-f]+$/);
  });

  await test('GET arquivo_url (o fetch do PDF da ficha, sem cabecalho de sessao) -> 200 image/png com os MESMOS bytes; sem assinatura -> 404', async () => {
    const url = fichaAtiva.entregas[0].arquivo_url;
    const res = await request(app).get(url).buffer(true).parse(binario);
    assert.strictEqual(res.status, 200, `status ${res.status}`);
    forma('GET arquivo_url headers', { 'content-type': res.headers['content-type'], 'x-content-type-options': res.headers['x-content-type-options'],
      'content-security-policy': res.headers['content-security-policy'], 'cross-origin-resource-policy': res.headers['cross-origin-resource-policy'] });
    assert.match(res.headers['content-type'], /^image\/png/);
    assert.ok(Buffer.isBuffer(res.body) && res.body.equals(PNG), 'os bytes servidos nao sao os da assinatura');
    assert.strictEqual(sha256(res.body), entrega.evidencia.arquivo_sha256);
    // controle: a mesma URL sem a assinatura (ou com ela trocada) nao abre
    assert.strictEqual((await request(app).get(url.split('?')[0])).status, 404);
    assert.strictEqual((await request(app).get(url.replace(/sig=[0-9a-f]/, (s) => (s.endsWith('0') ? 'sig=1' : 'sig=0')))).status, 404);
  });

  await test('[RN-178.08] /verificar -> { integro: true }', async () => {
    const res = await request(app).get(`/api/almoxarifado/epi/entregas/${entrega.id}/verificar`);
    assert.strictEqual(res.status, 200);
    forma('GET /verificar integro', res.body);
    assert.deepStrictEqual(res.body, { integro: true });
  });

  await test('[RN-178.08] 1 byte trocado no PNG em disco -> /verificar acusa { integro: false, motivo: "arquivo alterado" }', async () => {
    const bytes = fs.readFileSync(arquivoNoDisco);
    const i = Math.floor(bytes.length / 2);
    bytes[i] ^= 0x01;
    fs.writeFileSync(arquivoNoDisco, bytes);
    try {
      const res = await request(app).get(`/api/almoxarifado/epi/entregas/${entrega.id}/verificar`);
      assert.strictEqual(res.status, 200);
      forma('GET /verificar adulterado', res.body);
      assert.deepStrictEqual(res.body, { integro: false, motivo: 'arquivo alterado' });
    } finally {
      bytes[i] ^= 0x01; // devolve o byte mesmo se a assercao falhar (senao os testes seguintes herdam o arquivo adulterado)
      fs.writeFileSync(arquivoNoDisco, bytes);
    }
    assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${entrega.id}/verificar`)).body, { integro: true },
      'o byte devolvido nao voltou a dar integro');
  });

  await test('[C2] estorno da saida da entrega pelo livro -> 400 literal; saldo continua 8', async () => {
    const res = await request(app).post(`/api/almoxarifado/movimentacoes/${entrega.movimentacao_id}/cancelar`).send({ motivo: 'engano' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, ESTORNO_EPI);
    const det = await request(app).get(`/api/almoxarifado/materiais/${material.id}`);
    assert.strictEqual(Number(det.body.quantidade_atual), 8);
  });

  await test('[I2] colaborador excluido do cadastro -> a ficha pelo snapshot (excluido:true, CPF da evidencia mascarado) e a assinatura abre', async () => {
    await dbRun(db, 'DELETE FROM colaboradores WHERE id = ?', [colabId]);
    const aux = await request(app).get('/api/almoxarifado/aux/colaboradores');
    assert.ok(!aux.body.some((c) => c.id === colabId), 'o excluido continua na lista aux');
    const res = await request(app).get(`/api/almoxarifado/epi/ficha/${colabId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    forma('GET /epi/ficha excluido', res.body.colaborador);
    assert.deepStrictEqual(res.body.colaborador, {
      id: colabId, nome: 'JOSE DA SILVA T3', matricula: 'M-T3', setor: 'Caldeiraria', cpf_mascarado: '***.***.***-01', excluido: true });
    assert.strictEqual(res.body.entregas.length, 1);
    assert.strictEqual(res.body.entregas[0].registro_sha256, entrega.evidencia.registro_sha256);
    const img = await request(app).get(res.body.entregas[0].arquivo_url).buffer(true).parse(binario);
    assert.strictEqual(img.status, 200);
    assert.ok(img.body.equals(PNG));
    assert.deepStrictEqual((await request(app).get(`/api/almoxarifado/epi/entregas/${entrega.id}/verificar`)).body, { integro: true });
  });

  await test('as recusas que o front trata so por { error }: PNG > 2 MB -> 413 com error; MIME nao PNG -> 400 com error; nenhum arquivo orfao', async () => {
    const colab2 = (await dbRun(db, 'INSERT INTO colaboradores (nome, matricula, status) VALUES (?,?,?)', ['ANA T3', 'M-T3B', 'ativo'])).lastID;
    const grande = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10)]);
    const r413 = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(colab2)).field('material_id', String(material.id)).field('quantidade', '1')
      .attach('assinatura', grande, { filename: 'a.png', contentType: 'image/png' });
    forma('POST /epi/entregas 413', { status: r413.status, body: r413.body });
    assert.strictEqual(r413.status, 413);
    assert.match(String(r413.body && r413.body.error), /^Arquivo grande demais/);
    const r400 = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(colab2)).field('material_id', String(material.id)).field('quantidade', '1')
      .attach('assinatura', PNG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    forma('POST /epi/entregas MIME', { status: r400.status, body: r400.body });
    assert.strictEqual(r400.status, 400);
    assert.strictEqual(r400.body.error, 'A assinatura deve ser uma imagem PNG');
    const novos = fs.readdirSync(uploadsAlmoxDir).filter((f) => !ARQUIVOS_ANTES.has(f));
    assert.deepStrictEqual(novos, [path.basename(arquivoNoDisco)], `arquivos novos: ${novos.join(', ')}`);
  });

  await t.close();
  console.log(`\nepiPontaAPonta: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
