/**
 * Modelo de contrato "Projeto Conceitual" (pedido do Comercial, 24/11/2026).
 *
 *   PC-01  o servidor, subindo num banco novo, cria o modelo e ele aparece na lista que o cadastro de
 *          familia le (GET /api/clausulas-modelos), com as clausulas de clausulasProjetoConceitual.js
 *   PC-02  subir de novo nao duplica o modelo nem as clausulas (o semear e idempotente)
 *   PC-03  o documento sai na ordem do contrato: 1-3 no comeco, 5.1..5.15 antes da tabela de precos,
 *          a condicao de pagamento depois dela e a CONSIDERACAO FINAL na pagina de assinatura —
 *          nos dois formatos (o do modelo, com `numero`, e o gravado na proposta, com o numero no titulo)
 *   PC-04  nenhuma clausula some nem sai duas vezes
 *
 * Executar: node tests/api/modeloProjetoConceitual.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { getClausulasProjetoConceitual } = require('../../clausulasProjetoConceitual');
const { gerarHTMLPropostaPremiumV2 } = require('../../templates/propostaPremiumV2');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const MODELO = getClausulasProjetoConceitual();

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let saiu = null;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'modelo-pc-'));
const SEED = { email: 'pcseed@t.com', senha: 'PcSeed!senha123' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function j(m, u, tok) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m, headers: tok ? { Authorization: 'Bearer ' + tok } : {}, signal: AbortSignal.timeout(30000),
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
async function subir() {
  const logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const marcas = fs.existsSync(logArq) ? (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length : 0;
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 180000; // numa pasta do OneDrive a primeira subida passa de 60 s
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu}) — log em ${logArq}`);
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(SEED), signal: AbortSignal.timeout(5000),
      });
      const x = await r.json().catch(() => null);
      if (r.status === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length <= marcas) await pausa(200);
        await pausa(1500); // o semear dos modelos roda no callback do CREATE TABLE
        return x.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(200);
  }
  throw new Error('o index.js nao ficou pronto em 180 s — fim do log:\n' + fs.readFileSync(logArq, 'utf8').slice(-1500));
}
async function descer() {
  if (filho && saiu === null) {
    const morreu = new Promise((r) => filho.once('exit', r));
    filho.kill();
    await Promise.race([morreu, pausa(10000)]);
  }
  filho = null;
}
const lerBanco = (sql, p = []) => new Promise((res, rej) => {
  const cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.all(sql, p, (e, r) => cru.close(() => (e ? rej(e) : res(r))));
});

// ── o documento ───────────────────────────────────────────────────────────────────────────
const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Projeto Conceitual', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '24/11/2026' };
const html = (custom) => gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, true, true);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ocorrencias = (h, t) => h.split(esc(t)).length - 1;

function conferirOrdem(h, rotulo) {
  const posTabela = h.indexOf('Tabela de Preços');
  const posAssinatura = h.indexOf('pagina-assinatura" data-page-break'); // so 'pagina-assinatura' casa antes no CSS
  assert.ok(posTabela > 0 && posAssinatura > posTabela, `${rotulo}: tabela de precos e pagina de assinatura existem`);
  const pos = (t) => { const p = h.indexOf(esc(t)); assert.ok(p >= 0, `${rotulo}: "${t}" sumiu do documento`); return p; };
  const intro = MODELO.filter((c) => /^[123]\.$/.test(c.numero));
  const antes = MODELO.filter((c) => /^5\.(\d+)$/.test(c.numero) && !/PREÇO|CONSIDERAÇÃO FINAL/.test(c.titulo));
  assert.strictEqual(intro.length, 3, 'o modelo tem as tres secoes do comeco');
  assert.strictEqual(antes.length, 15, 'o modelo tem 5.1 a 5.15 antes do preco');
  // 1-3 na ordem, antes da secao 5
  const posSecao5 = h.indexOf('5. CONDIÇÕES GERAIS DE FORNECIMENTO');
  intro.reduce((ant, c) => { const p = pos(c.titulo); assert.ok(p > ant && p < posSecao5, `${rotulo}: ${c.numero} ${c.titulo} fora do lugar`); return p; }, 0);
  // 5.1..5.15 na ordem, entre a secao 5 e a tabela de precos
  antes.reduce((ant, c) => {
    const p = pos(`${c.numero} ${c.titulo}`);
    assert.ok(p > ant && p < posTabela, `${rotulo}: ${c.numero} ${c.titulo} fora do lugar (deveria vir antes da tabela de precos)`);
    return p;
  }, posSecao5);
  // abertura do preco antes da tabela; a condicao depois; a consideracao final na pagina de assinatura
  const pPreco = pos('5.16 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS');
  assert.ok(pPreco > pos('5.15 VALIDADE E ACEITE') && pPreco < posTabela, `${rotulo}: a abertura do preco fora do lugar`);
  const pCond = pos('1ª Parcela – Entrada:');
  assert.ok(pCond > posTabela && pCond < posAssinatura, `${rotulo}: a condicao de pagamento fora do lugar`);
  assert.ok(pos('5.17 CONSIDERAÇÃO FINAL') > posAssinatura, `${rotulo}: a consideracao final fora da pagina de assinatura`);
  // nenhuma sai duas vezes
  MODELO.forEach((c) => {
    if (c.titulo === 'CONDIÇÃO DE PAGAMENTO:') return; // o titulo dela sai sem o prefixo, so como "CONDIÇÃO DE PAGAMENTO:"
    assert.strictEqual(ocorrencias(h, c.titulo.replace(/:$/, '')) >= 1, true, `${rotulo}: ${c.titulo} nao saiu`);
  });
  assert.strictEqual(ocorrencias(h, '1ª Parcela – Entrada:'), 1, `${rotulo}: a condicao de pagamento saiu mais de uma vez`);
  assert.strictEqual(ocorrencias(h, 'O CLIENTE declara ter recebido as informações necessárias'), 1, `${rotulo}: a 5.9 saiu mais de uma vez`);
}

let token;
test('PC-01 o servidor cria o modelo "Projeto Conceitual" e a lista do cadastro de familia o traz', async () => {
  token = await subir();
  const [s, lista] = await j('GET', '/clausulas-modelos', token);
  assert.strictEqual(s, 200, JSON.stringify(lista));
  const modelos = (lista && lista.modelos) || [];
  const pc = modelos.find((m) => m.nome === 'Projeto Conceitual');
  assert.ok(pc, 'o modelo nao esta na lista: ' + modelos.map((m) => m.nome).join(', '));
  assert.ok(!pc.is_padrao, 'o Projeto Conceitual nao pode virar o padrao (Equipamentos continua prevalecendo na mistura)');
  // o "(21 clausulas)" da lista do cadastro de familia sai deste total
  assert.strictEqual(pc.total_clausulas, MODELO.length);
  const [s2, cl] = await j('GET', `/clausulas-modelos/${pc.id}/clausulas`, token);
  assert.strictEqual(s2, 200, JSON.stringify(cl));
  const doBanco = ((cl && cl.clausulas) || []).map((c) => `${c.numero} ${c.titulo}`);
  assert.deepStrictEqual(doBanco, MODELO.map((c) => `${c.numero} ${c.titulo}`));
});

test('PC-02 subir de novo nao duplica o modelo nem as clausulas', async () => {
  await descer();
  token = await subir();
  const modelos = await lerBanco("SELECT id FROM clausulas_modelo WHERE nome = 'Projeto Conceitual'");
  assert.strictEqual(modelos.length, 1);
  const itensM = await lerBanco('SELECT COUNT(*) AS n FROM clausulas_modelo_itens WHERE modelo_id = ?', [modelos[0].id]);
  assert.strictEqual(itensM[0].n, MODELO.length);
  await descer();
});

test('PC-03/04 documento com as clausulas do modelo (com numero): ordem do contrato, nenhuma some nem repete', () => {
  conferirOrdem(html(MODELO.map((c) => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }))), 'modelo');
});

test('PC-03/04 documento com as clausulas gravadas na proposta (numero no titulo, como o /clausulas/inicializar grava)', () => {
  conferirOrdem(html(MODELO.map((c, i) => ({ id: 100 + i, titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo }))), 'gravadas');
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); passed++; console.log('  ✓ ' + nome); }
    catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
  }
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo as vezes */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
