/**
 * Etapa 141 (propostas) — o documento da proposta barrado no servidor (C304) e os valores em reais do pedido (C306), pelo `index.js` de
 * verdade (pasta vazia).
 *
 *   RN-141.01 o /pdf recusa o desconto nao liberado, em qualquer status, sem gravar nada     RN-141.05 a aprovacao que nao casa nao libera
 *   RN-141.02 o /premium recusa o mesmo                                                     RN-141.06 ordem: 401 -> 400 -> 503 -> 404 -> 403
 *   RN-141.03 o editor (embed=1/true) tambem recusa (Fase 2, I3)                            RN-141.08 os R$ do pedido saem da proposta
 *   RN-141.04 o liberado sai como antes (<= 5, nulo, ou aprovacao que casa)
 *
 * Antes: o preview e o PDF so eram barrados pelos botoes da tela. Com o editor do preview aberto numa aba e, noutra, nova revisao ->
 * desconto 50% -> salvar, o PDF do editor saia com 50% sem aprovacao. E o pedido de aprovacao gravava o total, o desconto em reais e o
 * valor com desconto que o corpo dissesse.
 *
 * Integracao pela rota E pelo servico: cada recusa/liberacao confere tambem `aprovacaoDesconto.margemLiberada` contra o mesmo banco.
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa141-o-documento-barrado-no-servidor.md
 * Molde: aprovacaoDescontoAutorizacao.api.test.js.
 * Executar: cd server && node tests/api/propostaDocumentoDesconto.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const aprovacaoDesconto = require('../../aprovacaoDesconto');

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
/** O documento: status, tipo e o corpo cru (texto) — o PDF e o HTML nao sao JSON. */
async function doc(u, tok) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    headers: tok ? { Authorization: 'Bearer ' + tok } : {},
    signal: AbortSignal.timeout(120000),
  });
  const tipo = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  if (tipo.includes('application/json')) { try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* nao e json */ } }
  return { status: r.status, tipo, buf, json };
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e141super@t.com', senha: 'E141super!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS', 'ATRASO_SQL_INJETADO']) delete env[k];
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

const L = {
  DOCUMENTO: 'Não é possível gerar o documento (visualização ou PDF) de uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações; se a proposta já saiu do rascunho, emita uma nova revisão e salve-a para pedir a aprovação.',
  PROPOSTA_404: 'Proposta não encontrada',
  ID_INVALIDO: 'ID da proposta inválido',
};

const ctx = { n: 0, id: {}, tok: {} };
const ITENS = [{ descricao: 'Item 1', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000, codigo_produto: 'P1' }];
async function novaProposta(quem, extra = {}) {
  const [s, p] = await j('POST', '/propostas', ctx.tok[quem], { cliente_id: ctx.clienteId, titulo: `Prop ${++ctx.n}`, valor_total: 1000, status: 'rascunho', itens: ITENS, ...extra });
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
async function pedir(quem, propostaId, valor, extra = {}) {
  const [s, x] = await j('POST', '/aprovacoes', ctx.tok[quem], { proposta_id: propostaId, tipo: 'desconto', valor_desconto: valor, status: 'pendente', ...extra });
  assert.strictEqual(s, 200, `pedir: ${s} ${JSON.stringify(x)}`);
  return x.id;
}
async function aprovar(quem, aid) {
  const [s, x] = await j('PUT', `/aprovacoes/${aid}`, ctx.tok[quem], { status: 'aprovado' });
  assert.strictEqual(s, 200, `aprovar: ${s} ${JSON.stringify(x)}`);
}
/** Rascunho com margem m, pedido do vendedor e aprovado por aprov1: fica desconto_aprovado com m. */
async function propostaAprovada(m) {
  const pid = await novaProposta('vend', { margem_desconto: m });
  const aid = await pedir('vend', pid, m);
  await aprovar('aprov1', aid);
  const p = await get('SELECT status, margem_desconto FROM propostas WHERE id = ?', [pid]);
  assert.deepStrictEqual([p.status, p.margem_desconto], ['desconto_aprovado', m]);
  return { pid, aid };
}

/** O retrato que o /pdf grava — tem de ficar intacto na recusa. */
async function retrato(pid) {
  const p = await get('SELECT html_rendered, css_snapshot, pdf_gerado_at, snapshot_checksum FROM propostas WHERE id = ?', [pid]);
  const n = (await get('SELECT COUNT(*) n FROM proposta_snapshot WHERE proposta_id = ?', [pid])).n;
  return { ...p, snapshots: n };
}
/** O serviço, contra o mesmo banco: a margem gravada esta liberada? */
async function servico(pid) {
  const p = await get('SELECT margem_desconto FROM propostas WHERE id = ?', [pid]);
  return new Promise((res, rej) => aprovacaoDesconto.margemLiberada(cru, pid, aprovacaoDesconto.margemParaRegra(p.margem_desconto),
    (e, ok) => (e ? rej(e) : res(ok))));
}

const logDesde = (n) => fs.readFileSync(logArq).slice(n).toString('utf8');
const tamLog = () => fs.statSync(logArq).size;
/** A recusa nas portas do documento (403 L-DOCUMENTO, inclusive o embed do editor), sem gravar o retrato nem abrir o navegador; o servico concorda. */
async function recusado(pid, { pdf = true } = {}) {
  const antes = await retrato(pid);
  const marca = tamLog();
  const pr = await doc(`/propostas/${pid}/premium`, ctx.tok.vend);
  assert.deepStrictEqual([pr.status, pr.json && pr.json.error], [403, L.DOCUMENTO], `premium: ${pr.status} ${pr.buf.toString('utf8').slice(0, 200)}`);
  const pr0 = await doc(`/propostas/${pid}/premium?embed=0`, ctx.tok.vend);
  assert.deepStrictEqual([pr0.status, pr0.json && pr0.json.error], [403, L.DOCUMENTO], 'premium?embed=0 nao e o editor');
  if (pdf) {
    const pd = await doc(`/propostas/${pid}/pdf`, ctx.tok.vend);
    assert.deepStrictEqual([pd.status, pd.json && pd.json.error], [403, L.DOCUMENTO], `pdf: ${pd.status} ${pd.buf.toString('utf8').slice(0, 200)}`);
  }
  for (const e of ['1', 'true', '1&embed=1']) {
    const ed = await doc(`/propostas/${pid}/premium?embed=${e}`, ctx.tok.vend);
    assert.deepStrictEqual([ed.status, ed.json && ed.json.error], [403, L.DOCUMENTO], `o editor (embed=${e}) abriu: ${ed.buf.toString('utf8').slice(0, 200)}`);
  }
  await pausa(pdf ? 1500 : 300); // a gravacao do retrato, se houvesse, nao espera a resposta
  assert.deepStrictEqual(await retrato(pid), antes, 'a recusa gravou o retrato do PDF');
  assert.ok(!logDesde(marca).includes(`[PDF] proposta ${pid} `), 'a recusa abriu o navegador e gerou o PDF');
  assert.strictEqual(await servico(pid), false, 'a rota recusou e o servico libera');
}
/** A visualização sai (200 HTML); o servico concorda. */
async function liberadoPreview(pid) {
  const pr = await doc(`/propostas/${pid}/premium`, ctx.tok.vend);
  assert.strictEqual(pr.status, 200, `premium: ${pr.status} ${pr.buf.toString('utf8').slice(0, 200)}`);
  assert.ok(pr.tipo.includes('text/html') && pr.buf.toString('utf8').includes('<html'), 'premium nao e HTML');
  assert.strictEqual(await servico(pid), true, 'a rota liberou e o servico recusa');
}
/** O PDF sai (200 application/pdf) e grava o retrato — a metade positiva da RN-141.01. */
async function liberadoPdf(pid) {
  const marca = tamLog();
  const pd = await doc(`/propostas/${pid}/pdf`, ctx.tok.vend);
  assert.strictEqual(pd.status, 200, `pdf: ${pd.status} ${pd.buf.toString('utf8').slice(0, 300)}`);
  assert.ok(pd.tipo.includes('application/pdf') && pd.buf.slice(0, 5).toString('latin1') === '%PDF-', `pdf nao e PDF (${pd.tipo})`);
  let r = await retrato(pid);
  // a gravacao do retrato nao espera a resposta (db.run sem aguardar) — espera ate 5 s
  for (let k = 0; k < 25 && !(r.pdf_gerado_at && r.html_rendered); k++) { await pausa(200); r = await retrato(pid); }
  assert.ok(r.pdf_gerado_at && r.html_rendered, 'o PDF liberado nao gravou o retrato (o de sempre)');
  await pausa(300);
  assert.ok(logDesde(marca).includes(`[PDF] proposta ${pid} `), 'o observavel do navegador nao aparece no PDF liberado (a regua da recusa seria vazia)');
  const ed = await doc(`/propostas/${pid}/premium?embed=1`, ctx.tok.vend);
  assert.strictEqual(ed.status, 200, 'o editor do liberado nao abre');
}

// ── RN-141.01 / 02 / 03: a recusa ─────────────────────────────────────────────────────────
test('[RN-141.01][RN-141.02][RN-141.03] rascunho com 50% sem pedido: /pdf, /premium e o editor 403 sem gravar nada (antes: 200 com 50%)', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 50 });
  await recusado(pid);
});

test('[RN-141.01] o cenario da C304: enviada com 10% aprovado -> nova revisao -> PUT 50 -> recusa; PUT 10 de volta -> o PDF sai', async () => {
  const { pid } = await propostaAprovada(10);
  const [se, xe] = await j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
  assert.strictEqual(se, 200, JSON.stringify(xe));
  await liberadoPreview(pid); // enviada com a aprovacao que casa
  const [sr, xr] = await j('POST', `/propostas/${pid}/nova-revisao`, ctx.tok.vend);
  assert.strictEqual(sr, 200, JSON.stringify(xr));
  await liberadoPreview(pid); // rascunho, mesma margem: a aprovacao continua casando (B910)
  const [sp, xp] = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 50 });
  assert.strictEqual(sp, 200, JSON.stringify(xp));
  assert.deepStrictEqual(Object.values(await get('SELECT status, margem_desconto FROM propostas WHERE id = ?', [pid])), ['rascunho', 50]);
  await recusado(pid);
  const [sv, xv] = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 10 });
  assert.strictEqual(sv, 200, JSON.stringify(xv));
  await liberadoPreview(pid);
  await liberadoPdf(pid);
});

test('[RN-141.01] a regra e a do desconto, nao a do status: enviada e aprovada (legado, 30% sem aprovacao) tambem recusam', async () => {
  for (const status of ['enviada', 'aprovada', 'rejeitada', 'desconto_aprovado']) {
    const pid = await novaProposta('vend', { margem_desconto: 3 });
    await run('UPDATE propostas SET status = ?, margem_desconto = 30 WHERE id = ?', [status, pid]);
    await recusado(pid, { pdf: status === 'enviada' });
  }
});

// ── RN-141.05: o que nao casa ──────────────────────────────────────────────────────────────
test('[RN-141.05] aprovacao de outro percentual, pendente, rejeitada ou decidida por quem pediu nao libera', async () => {
  // outro percentual: aprovado 10, gravado 12 (rascunho)
  const { pid } = await propostaAprovada(10);
  assert.strictEqual((await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { status: 'rascunho', margem_desconto: 12 }))[0], 200);
  await recusado(pid, { pdf: false });
  // pendente
  const p2 = await novaProposta('vend', { margem_desconto: 20 });
  await pedir('vend', p2, 20);
  await recusado(p2, { pdf: false });
  // rejeitada
  const p3 = await novaProposta('vend', { margem_desconto: 20 });
  const a3 = await pedir('vend', p3, 20);
  assert.strictEqual((await j('PUT', `/aprovacoes/${a3}`, ctx.tok.aprov1, { status: 'rejeitado', motivo_rejeicao: 'nao' }))[0], 200);
  await recusado(p3, { pdf: false });
  // decidida por quem pediu (as de antes da Etapa 140) e sem decisor (as que nasciam aprovadas)
  for (const decisor of [ctx.id.vend, null]) {
    const p4 = await novaProposta('vend', { margem_desconto: 20 });
    await run(`INSERT INTO aprovacoes (proposta_id, tipo, valor_desconto, solicitado_por, aprovado_por, status)
               VALUES (?, 'desconto', 20, ?, ?, 'aprovado')`, [p4, ctx.id.vend, decisor]);
    await recusado(p4, { pdf: false });
  }
});

test('[RN-141.05] margem gravada ilegivel (texto "10,5", legado) conta como acima de 5 e recusa', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 3 });
  await run("UPDATE propostas SET margem_desconto = '10,5' WHERE id = ?", [pid]);
  assert.strictEqual((await get('SELECT typeof(margem_desconto) t FROM propostas WHERE id = ?', [pid])).t, 'text');
  await recusado(pid);
});

// ── RN-141.04: o liberado ──────────────────────────────────────────────────────────────────
test('[RN-141.04] margem ate 5 (3, 5, 0 e nula), em rascunho, sai nas duas portas como antes', async () => {
  for (const m of [3, 5, 0, null]) {
    const pid = await novaProposta('vend', { margem_desconto: 3 });
    await run('UPDATE propostas SET margem_desconto = ? WHERE id = ?', [m, pid]);
    await liberadoPreview(pid);
  }
  const pid = await novaProposta('vend', { margem_desconto: 3 });
  await liberadoPdf(pid);
});

test('[RN-141.04] desconto aprovado com a aprovacao que casa (12,5 = 12.5) sai na visualizacao', async () => {
  const { pid } = await propostaAprovada(12.5);
  await liberadoPreview(pid);
});

// ── RN-141.06: a ordem ─────────────────────────────────────────────────────────────────────
test('[RN-141.06] sem login 401; id invalido 400; proposta inexistente 404 (nao 403) nas duas portas', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 50 });
  for (const porta2 of ['premium', 'pdf']) {
    const s = await doc(`/propostas/${pid}/${porta2}`, null);
    assert.strictEqual(s.status, 401, `${porta2} sem login`);
    const inv = await doc(`/propostas/abc/${porta2}`, ctx.tok.vend);
    assert.deepStrictEqual([inv.status, inv.json && inv.json.error], [400, L.ID_INVALIDO], `${porta2} id invalido`);
    const n = await doc(`/propostas/99999/${porta2}`, ctx.tok.vend);
    assert.deepStrictEqual([n.status, n.json && n.json.error], [404, L.PROPOSTA_404], `${porta2} inexistente`);
  }
  await recusado(pid, { pdf: false });
});

(async () => {
  console.log('\n=== Etapa 141 (propostas): o documento barrado no servidor (C304) e os R$ do pedido (C306) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e141-doc-'));
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 15000);
    const quem = { aprov1: { pode_aprovar_descontos: 1 }, vend: {} };
    for (const [k, extra] of Object.entries(quem)) {
      const email = `${k}141@t.com`;
      const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: k, email, senha: 'Senha!141', cargo: 'C', role: 'usuario', setor: '', ...extra });
      assert.strictEqual(s, 200, `criar ${k}: ${s} ${JSON.stringify(c)}`);
      ctx.id[k] = c.id;
      const [ls, l] = await j('POST', '/auth/login', null, { email, senha: 'Senha!141' });
      assert.strictEqual(ls, 200, `login ${k}`);
      ctx.tok[k] = l.token;
    }
    assert.strictEqual(Number((await get('SELECT pode_aprovar_descontos p FROM usuarios WHERE id = ?', [ctx.id.aprov1])).p), 1);
    const [sc, cli] = await j('POST', '/clientes', ctx.T, {
      razao_social: 'Cli 141', nome_fantasia: 'Fant', cnpj: '11.222.333/0001-44', segmento: 'Seg', telefone: '(11) 9999-0000', email: 'a@a.com',
      endereco: 'Rua A', cidade: 'Sao Paulo', estado: 'SP', cep: '01000-000', contato_principal: 'Joao', observacoes: 'obs',
    });
    assert.strictEqual(sc, 200, JSON.stringify(cli));
    ctx.clienteId = cli.id;
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
