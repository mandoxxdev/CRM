/**
 * Etapa 139 (propostas) — integração: a cláusula 5.25 incluída pelas rotas de cláusula sai no preview (`GET /premium`),
 * pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-139.01 nenhuma cláusula da entrada some: a 5.25+ que não é a CONSIDERAÇÃO FINAL é renderizada depois da seção de
 *             preço (5.24) e antes da página de assinatura.
 *
 * O caminho é o do editor do preview: inicializar as cláusulas, incluir uma (a renumeração do editor a chama de 5.25 e
 * empurra a consideração final para 5.26 — `renumerarClausulas` pula o 24, que é a seção de preço), reordenar. De a33dfca1
 * (28/07/2026) até a Etapa 139 o template a tirava da lista e não a renderizava: ela sumia do preview e do PDF e, como o
 * salvamento do preview marca como removida toda cláusula do banco que não está no #proposalSource, a edição seguinte a
 * APAGAVA. Por isso o teste confere que ela está DENTRO do #proposalSource (é o que o salvamento lê).
 * O mesmo pelo serviço (gerarHTMLPropostaPremiumV2 direto, no navegador): tests/propostaInvariantes.test.js, cenários
 * banco+inclusao e banco+duas.
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa139-as-invariantes-da-proposta.md
 * Molde: putParcialMantem.api.test.js.
 * Executar: cd server && node tests/api/propostaClausulaAlem524.api.test.js
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

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  let x = null; try { x = await r.json(); } catch (e) { /* sem corpo */ }
  return [r.status, x];
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e139clausula@t.com', senha: 'E139clausula!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await j('POST', '/auth/login', null, SEED);
      if (s === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !fs.readFileSync(logArq, 'utf8').includes('Banco de dados totalmente inicializado')) await pausa(200);
        await pausa(1500);
        return x.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(200);
  }
  throw new Error('o index.js nao ficou pronto em 60 s');
}
async function descer() {
  if (filho && saiu === null) {
    const morreu = new Promise((r) => filho.once('exit', r));
    filho.kill();
    await Promise.race([morreu, pausa(10000)]);
  }
  filho = null;
}

// ── o arquivo, por fora ───────────────────────────────────────────────────────────────────
let cru = null;
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = async (sql, p = []) => (await all(sql, p))[0];
const ctx = { n: 0 };
async function novoCliente() {
  const [s, c] = await j('POST', '/clientes', ctx.T, {
    razao_social: `Cli ${++ctx.n}`, nome_fantasia: 'Fant', cnpj: '11.222.333/0001-44', segmento: 'Seg', telefone: '(11) 9999-0000', email: 'a@a.com',
    endereco: 'Rua A', cidade: 'Sao Paulo', estado: 'SP', cep: '01000-000', contato_principal: 'Joao', observacoes: 'obs',
  });
  assert.strictEqual(s, 200, JSON.stringify(c));
  await run("UPDATE clientes SET logo_url = 'logo-139.png' WHERE id = ?", [c.id]);
  return c.id;
}

async function premiumHtml(id) {
  const r = await fetch(`http://127.0.0.1:${porta}/api/propostas/${id}/premium`, {
    headers: { Authorization: 'Bearer ' + ctx.T }, signal: AbortSignal.timeout(30000),
  });
  const html = await r.text();
  assert.strictEqual(r.status, 200, html.slice(0, 300));
  return html;
}
/** O conteúdo do #proposalSource: o que o paginador distribui nas páginas e o que o salvamento do preview lê. */
function fonte(html) {
  const ini = html.indexOf('id="proposalSource"');
  assert.ok(ini > 0, 'o HTML nao tem #proposalSource');
  const fim = html.indexOf('<script', ini);
  return html.slice(ini, fim > 0 ? fim : undefined);
}

test('[RN-139.01] a clausula incluida pelo editor (5.25, CF em 5.26) sai no preview, depois da secao de preco e antes da CF', async () => {
  const [s, p] = await j('POST', '/propostas', ctx.T, {
    cliente_id: ctx.clienteId, titulo: 'Prop clausula', valor_total: 100, status: 'rascunho',
    itens: [{ descricao: 'Item 1', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100, codigo_produto: 'P1' }],
  });
  assert.strictEqual(s, 200, JSON.stringify(p));
  let r = await j('POST', `/propostas/${p.id}/clausulas/inicializar`, ctx.T, {});
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const [, lista] = await j('GET', `/propostas/${p.id}/clausulas`, ctx.T);
  const cls = lista.clausulas;
  assert.strictEqual(lista.isDefault, false, 'inicializar nao gravou as clausulas');
  const cf = cls.find((c) => /CONSIDERA[ÇC][ÃA]O FINAL/i.test(c.titulo));
  assert.ok(cf, `sem consideracao final: ${cls.map((c) => c.titulo).join(' | ')}`);
  assert.ok(/^5\.25 /.test(cf.titulo), `a consideracao final do modelo nao e 5.25: ${cf.titulo}`);
  // o que o salvamento do preview manda depois de "+ clausula" antes da consideracao final
  r = await j('PUT', `/propostas/${p.id}/clausulas/${cf.id}`, ctx.T, { titulo: '5.26 CONSIDERAÇÃO FINAL', conteudo: cf.conteudo });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const [sn, nova] = await j('POST', `/propostas/${p.id}/clausulas`, ctx.T, { titulo: '5.25 CLAUSULA DA ROTA', conteudo: 'Texto da clausula da rota.' });
  assert.strictEqual(sn, 201, JSON.stringify(nova));
  const ordem = cls.filter((c) => c.id !== cf.id).map((c) => c.id).concat([nova.id, cf.id]);
  r = await j('PUT', `/propostas/${p.id}/clausulas/reordenar`, ctx.T, { ordem });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));

  const src = fonte(await premiumHtml(p.id));
  const iNova = src.indexOf('5.25 CLAUSULA DA ROTA');
  const iCf = src.indexOf('5.26 CONSIDERAÇÃO FINAL');
  const iPreco = src.search(/5\.24 PRE[ÇC]O, CONDI[ÇC][ÃA]O DE PAGAMENTO/);
  assert.ok(iNova > 0, 'a 5.25 incluida sumiu do #proposalSource (o proximo salvamento do preview a apagaria)');
  assert.ok(iCf > 0, 'a consideracao final sumiu');
  assert.ok(iPreco > 0, 'a secao de preco 5.24 sumiu');
  assert.ok(iPreco < iNova && iNova < iCf, `ordem errada: preco ${iPreco}, 5.25 ${iNova}, CF ${iCf}`);
  assert.ok(src.includes('Texto da clausula da rota.'), 'o conteudo da 5.25 sumiu');
});

(async () => {
  console.log('\n=== Etapa 139 (propostas): a clausula 5.25 incluida pelas rotas sai no preview ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e139-clausula-'));
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 15000);
    ctx.clienteId = await novoCliente();
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
