/**
 * Proposta bilíngue — rotas e integração com o servidor real (specs/proposta-bilingue/README.md; plano
 * docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md, contratos congelados).
 *
 *   BI-A01 POST /api/traducoes exige login
 *   BI-A02 recusas com a mensagem literal: idioma (inclusive 'pt-BR'), origem, itens (vazio, não-texto, origem vazia, > 5.000), tradução vazia
 *   BI-A03 RN-BI.06 auto não sobrescreve manual (ignorada); manual sobrescreve; repetido no mesmo pedido = vale o último
 *   BI-A04 PUT /api/propostas/:id valida idioma e moeda (mensagens literais); valores válidos gravam e voltam no GET
 *   BI-A05 integração (cruza as rotas): proposta 'en' — o /premium do EDITOR sai em PT e diz o idioma no cabeçalho; o /premium?bilingue=1
 *          traz o texto pendente; POST /api/traducoes; o /premium?bilingue=1 passa a trazer a tradução; proposta pt-BR com bilingue=1 = PT
 *   BI-A06 RN-BI.04 o PDF da proposta 'en' diz quantos textos saíram sem tradução (X-Traducoes-Pendentes)
 *
 * Executar: node tests/api/traducoesProposta.api.test.js   (BI-A06 gera PDF: precisa do Chrome do puppeteer ou de
 * PUPPETEER_EXECUTABLE_PATH apontando para um Chrome instalado)
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let porta; let filho = null; let saiu = null;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'traducoes-bi-'));
const SEED = { email: 'biseed@t.com', senha: 'BiSeed!senha123' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function req(m, u, tok, body, comoTexto) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const texto = comoTexto ? await r.text() : null;
  let json = null; if (!comoTexto) { try { json = await r.json(); } catch (e) { /* sem corpo */ } }
  return { status: r.status, json, texto, headers: r.headers };
}
function portaLivre() {
  return new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function subir() {
  const logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 180000; // numa pasta do OneDrive a primeira subida passa de 60 s
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const r = await req('POST', '/auth/login', null, SEED);
      if (r.status === 200 && r.json && r.json.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
        await pausa(1500);
        return r.json.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(300);
  }
  throw new Error('o index.js nao ficou pronto em 180 s — fim do log:\n' + fs.readFileSync(logArq, 'utf8').slice(-1500));
}
const banco = (sql, p = []) => new Promise((res, rej) => {
  const cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.configure('busyTimeout', 15000);
  cru.run(sql, p, function feito(e) { const r = this; cru.close(() => (e ? rej(e) : res(r))); });
});
const ler = (sql, p = []) => new Promise((res, rej) => {
  const cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.all(sql, p, (e, r) => cru.close(() => (e ? rej(e) : res(r))));
});

let token;
const ERR = {
  idioma: 'Idioma inválido. Use en ou es.',
  origem: 'Origem inválida. Use auto ou manual.',
  itens: 'Envie os itens (até 500), cada um com texto_origem e texto_traduzido de até 5.000 caracteres.',
  vazia: 'A tradução não pode ficar vazia.',
  marcadores: 'A tradução tem de manter os mesmos marcadores {{…}} do texto em português.',
};
const item = (o, t) => ({ texto_origem: o, texto_traduzido: t });

test('BI-A01 POST /api/traducoes sem login: 401', async () => {
  token = await subir();
  const r = await req('POST', '/traducoes', null, { idioma: 'en', origem: 'auto', itens: [item('a', 'b')] });
  assert.ok(r.status === 401 || r.status === 403, String(r.status));
});

test('BI-A02 recusas com a mensagem literal', async () => {
  const casos = [
    [{ idioma: 'pt-BR', origem: 'auto', itens: [item('a', 'b')] }, ERR.idioma],
    [{ idioma: 'fr', origem: 'auto', itens: [item('a', 'b')] }, ERR.idioma],
    [{ idioma: 'en', origem: 'x', itens: [item('a', 'b')] }, ERR.origem],
    [{ idioma: 'en', origem: 'auto', itens: [] }, ERR.itens],
    [{ idioma: 'en', origem: 'auto', itens: [{ texto_origem: 1, texto_traduzido: 'b' }] }, ERR.itens],
    [{ idioma: 'en', origem: 'auto', itens: [item('   ', 'b')] }, ERR.itens],
    [{ idioma: 'en', origem: 'auto', itens: [item('a'.repeat(5001), 'b')] }, ERR.itens],
    [{ idioma: 'en', origem: 'manual', itens: [item('Garantia.', '  ')] }, ERR.vazia],
    // Fase 5, critico 1: a correcao feita a partir do texto visivel (o marcador ja trocado pelo nome do cliente) e recusada
    [{ idioma: 'en', origem: 'manual', itens: [item('Proposta para {{cliente.nome}}.', 'Proposal for ACME SA.')] }, ERR.marcadores],
    [{ idioma: 'en', origem: 'auto', itens: [item('Proposta.', 'Proposal for {{cliente.nome}}.')] }, ERR.marcadores],
  ];
  for (const [corpo, msg] of casos) {
    const r = await req('POST', '/traducoes', token, corpo);
    assert.strictEqual(r.status, 400, JSON.stringify(corpo).slice(0, 80));
    assert.deepStrictEqual(r.json, { error: msg });
  }
  assert.strictEqual((await ler('SELECT COUNT(*) AS n FROM traducoes'))[0].n, 0, 'recusa nao pode gravar nada');
});

test('BI-A03 RN-BI.06 auto nao vence manual; manual vence; repetido = ultimo', async () => {
  let r = await req('POST', '/traducoes', token, { idioma: 'en', origem: 'auto', itens: [item('Garantia de 12 meses.', 'auto 1')] });
  assert.deepStrictEqual(r.json, { gravadas: 1, ignoradas: 0 });
  r = await req('POST', '/traducoes', token, { idioma: 'en', origem: 'manual', itens: [item('Garantia  de 12\nmeses.', '12-month warranty.')] });
  assert.deepStrictEqual(r.json, { gravadas: 1, ignoradas: 0 }, 'mesma chave depois de normalizar');
  r = await req('POST', '/traducoes', token, { idioma: 'en', origem: 'auto', itens: [item('Garantia de 12 meses.', 'auto 2')] });
  assert.deepStrictEqual(r.json, { gravadas: 0, ignoradas: 1 });
  r = await req('POST', '/traducoes', token, { idioma: 'en', origem: 'auto', itens: [item('Frase.', 'primeira'), item('Frase.', 'ultima')] });
  assert.deepStrictEqual(r.json, { gravadas: 1, ignoradas: 0 });
  const linhas = await ler("SELECT texto_origem, texto_traduzido, origem FROM traducoes WHERE idioma = 'en' ORDER BY texto_origem");
  assert.deepStrictEqual(linhas, [
    { texto_origem: 'Frase.', texto_traduzido: 'ultima', origem: 'auto' },
    { texto_origem: 'Garantia de 12 meses.', texto_traduzido: '12-month warranty.', origem: 'manual' },
  ]);
});

test('BI-A07 portao: quem nao tem o Comercial toma 403 e nao grava; quem tem grava, com o autor (Fase 5, 4)', async () => {
  const criar = async (nome, comComercial) => {
    const email = `${nome}@bi.t`;
    const r = await req('POST', '/usuarios', token, { nome, email, senha: 'Senha!Bi2026', cargo: 'C', role: 'usuario', setor: '' });
    assert.ok(r.status === 200 || r.status === 201, `usuario ${nome}: ${r.status} ${JSON.stringify(r.json)}`);
    const [{ id }] = await ler('SELECT id FROM usuarios WHERE email = ?', [email]);
    // Usuario SEM nenhuma permissao cadastrada ve tudo (regra legada do sistema — a 1a rodada deste teste deu 200 assim). O barrado
    // do Comercial e o que tem acesso a OUTRO modulo so — o mesmo molde do osModeloContratoPortao ("so a direta do Almoxarifado").
    await banco("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, comComercial ? 'comercial' : 'almoxarifado']);
    const l = await req('POST', '/auth/login', null, { email, senha: 'Senha!Bi2026' });
    assert.strictEqual(l.status, 200, JSON.stringify(l.json));
    return { id, T: l.json.token };
  };
  const sem = await criar('semcomercial', false);
  const com = await criar('comcomercial', true);
  const corpo = { idioma: 'es', origem: 'manual', itens: [item('Texto do portao.', 'Texto de la puerta.')] };
  const negado = await req('POST', '/traducoes', sem.T, corpo);
  assert.strictEqual(negado.status, 403, JSON.stringify(negado.json));
  assert.strictEqual((await ler("SELECT COUNT(*) AS n FROM traducoes WHERE texto_origem = 'Texto do portao.'"))[0].n, 0);
  const ok = await req('POST', '/traducoes', com.T, corpo);
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  const [linha] = await ler("SELECT updated_by FROM traducoes WHERE texto_origem = 'Texto do portao.'");
  assert.strictEqual(linha.updated_by, com.id, 'a memoria guarda quem gravou');
});

let idEn; let idPt;
test('BI-A04 PUT /api/propostas/:id valida idioma e moeda; valido grava', async () => {
  idEn = (await banco("INSERT INTO propostas (numero_proposta, titulo) VALUES ('BI-EN', 'PROJETO TESTE')")).lastID;
  idPt = (await banco("INSERT INTO propostas (numero_proposta, titulo) VALUES ('BI-PT', 'PROJETO TESTE')")).lastID;
  // O valor e digitado em REAIS em qualquer moeda e o documento converte pela cotacao (25/11/2026): R$ 5.000 a 5 = US$ 1.000.
  for (const id of [idEn, idPt]) await banco('INSERT INTO proposta_itens (proposta_id, descricao, quantidade, valor_unitario, valor_total) VALUES (?, ?, 1, 5000, 5000)', [id, 'Item de teste']);
  let r = await req('PUT', `/propostas/${idEn}`, token, { idioma: 'fr' });
  assert.strictEqual(r.status, 400); assert.deepStrictEqual(r.json, { error: 'Idioma inválido. Use pt-BR, en ou es.' });
  r = await req('PUT', `/propostas/${idEn}`, token, { moeda: 'US$' });
  assert.strictEqual(r.status, 400); assert.deepStrictEqual(r.json, { error: 'Moeda inválida. Use BRL, USD ou EUR.' });
  r = await req('PUT', `/propostas/${idEn}`, token, { idioma: 'en', moeda: 'USD', taxa_cambio: '5', incoterm: 'FOB – Porto de Santos' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const [p] = await ler('SELECT idioma, moeda, incoterm FROM propostas WHERE id = ?', [idEn]);
  assert.deepStrictEqual(p, { idioma: 'en', moeda: 'USD', incoterm: 'FOB – Porto de Santos' });
});

test('BI-A05 integracao: editor em PT + idioma no cabecalho; bilingue pendente -> traduz -> traduzido', async () => {
  const editor = await req('GET', `/propostas/${idEn}/premium?embed=1`, token, undefined, true);
  assert.strictEqual(editor.status, 200, editor.texto.slice(0, 200));
  assert.strictEqual(editor.headers.get('x-proposta-idioma'), 'en');
  assert.ok(!editor.texto.includes('class="bi-par'), 'o preview do EDITOR tem de continuar so em PT');
  assert.ok(editor.texto.includes('data-clausula-key='), 'e editavel');

  const chave = 'A proposta apresentada a seguir, foi elaborada atendendo às solicitações e especificações informadas pelo CONTRATANTE, através de reunião, ligação e/ou e-mail.';
  let bi = await req('GET', `/propostas/${idEn}/premium?embed=1&bilingue=1`, token, undefined, true);
  assert.strictEqual(bi.status, 200);
  assert.ok(bi.texto.includes('class="bi-par'), 'bilingue=1 em proposta en: duas colunas');
  assert.ok(bi.texto.includes(`data-traduzir="${chave}"`), 'o texto da 2. ELABORACAO sai pendente');
  assert.ok(/US\$\s1\.000,00/.test(bi.texto) && bi.texto.includes('$1,000.00'), 'moeda da proposta nas duas metades');
  assert.ok(bi.texto.includes('FOB – Porto de Santos'), 'incoterm');

  const g = await req('POST', '/traducoes', token, { idioma: 'en', origem: 'auto', itens: [item(chave, 'The proposal below was prepared according to the requests of the CONTRACTING PARTY.')] });
  assert.deepStrictEqual(g.json, { gravadas: 1, ignoradas: 0 });
  bi = await req('GET', `/propostas/${idEn}/premium?embed=1&bilingue=1`, token, undefined, true);
  assert.ok(!bi.texto.includes(`data-traduzir="${chave}"`), 'depois de gravada, nao e mais pendente');
  assert.ok(bi.texto.includes('>The proposal below was prepared according to the requests of the CONTRACTING PARTY.<'), 'a traducao entra no documento');

  const pt = await req('GET', `/propostas/${idPt}/premium?embed=1&bilingue=1`, token, undefined, true);
  assert.strictEqual(pt.headers.get('x-proposta-idioma'), 'pt-BR');
  assert.ok(!pt.texto.includes('class="bi-par'), 'proposta pt-BR nunca sai em duas colunas');
});

test('BI-A06 RN-BI.04 o PDF da proposta en diz quantos textos sairam sem traducao', async () => {
  const r = await fetch(`http://127.0.0.1:${porta}/api/propostas/${idEn}/pdf`, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(240000) });
  const corpo = Buffer.from(await r.arrayBuffer());
  assert.strictEqual(r.status, 200, corpo.toString('utf8').slice(0, 200));
  assert.strictEqual(corpo.slice(0, 4).toString(), '%PDF');
  const n = Number(r.headers.get('x-traducoes-pendentes'));
  assert.ok(Number.isInteger(n) && n > 0, `X-Traducoes-Pendentes = ${r.headers.get('x-traducoes-pendentes')}`);
  const rPt = await fetch(`http://127.0.0.1:${porta}/api/propostas/${idPt}/pdf`, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(240000) });
  await rPt.arrayBuffer();
  assert.strictEqual(rPt.headers.get('x-traducoes-pendentes'), '0', 'pt-BR: nenhum pendente');
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
  }
  if (filho && saiu === null) { const morreu = new Promise((r) => filho.once('exit', r)); filho.kill(); await Promise.race([morreu, pausa(10000)]); }
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
