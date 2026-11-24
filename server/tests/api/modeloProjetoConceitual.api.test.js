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
 *   PC-05  pela rota do preview (/premium, servidor real): proposta so de familia ligada ao Projeto Conceitual sai com
 *          a capa "servicos especializados" e sem a tabela FINAME; misturada com equipamento, como antes
 *   PC-06  a regra da capa no template: acento e caixa, e na duvida (sem mapa, item sem familia, familia sem
 *          modelo, outro modelo) fica a de equipamentos; proposta so de pecas nao muda
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
const escreverBanco = (sql, p = []) => new Promise((res, rej) => {
  const cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.configure('busyTimeout', 15000);
  cru.run(sql, p, function feito(e) { const r = this; cru.close(() => (e ? rej(e) : res(r))); });
});
const CAPA_SERVICO = 'PROPOSTA PARA FORNECIMENTO DE SERVIÇOS ESPECIALIZADOS';
const CAPA_EQUIP = 'PROPOSTA PARA FORNECIMENTO DE EQUIPAMENTOS INDUSTRIAIS';
const FINAME = 'Tabela Ref. FINAME / Ref. Cartão BNDES';

// ── o documento ───────────────────────────────────────────────────────────────────────────
const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
// Proposta inteira de Projeto Conceitual: o item e de uma familia ligada ao modelo — o documento de SERVICO (24/11/2026).
const itens = [{ produto_nome: 'Projeto Conceitual', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000, familia_produto: 'PC GMP' }];
const totais = { total: 1000, dataEmissao: '24/11/2026' };
const html = (custom) => gerarHTMLPropostaPremiumV2(proposta, itens, totais,
  { clausulas_custom: custom, modelo_por_familia: { 'PC GMP': 'Projeto Conceitual' } }, null, true, true);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const corpoDoc = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
const ocorrencias = (h, t) => corpoDoc(h).split(esc(t)).length - 1;

// A ordem da proposta de origem (pedido do usuario, 24/11/2026: "seguir exatamente minha proposta"): 1 a 20, sem secao de
// equipamento, quadro "Valor Total dos Servicos" no 16, a condicao de pagamento antes do 17, 19 e 20 na pagina de assinatura.
function conferirOrdem(h, rotulo) {
  const c = corpoDoc(h);
  const posAssinatura = c.indexOf('pagina-assinatura" data-page-break');
  assert.ok(posAssinatura > 0, `${rotulo}: pagina de assinatura existe`);
  const pos = (t) => { const p = c.indexOf(esc(t)); assert.ok(p >= 0, `${rotulo}: "${t}" sumiu do documento`); return p; };
  const principais = MODELO.filter((x) => x.titulo !== 'CONDIÇÃO DE PAGAMENTO:');
  assert.strictEqual(principais.length, 20, 'o modelo tem as 20 clausulas da proposta de origem');
  const posicoes = principais.map((x, i) => pos(`${i + 1}. ${x.titulo}`));
  posicoes.reduce((ant, p, i) => { assert.ok(p > ant, `${rotulo}: ${i + 1}. ${principais[i].titulo} fora de ordem`); return p; }, -1);
  assert.ok(posicoes[18] > posAssinatura && posicoes[19] > posAssinatura, `${rotulo}: 19 e 20 na pagina de assinatura`);
  assert.ok(posicoes[17] < posAssinatura, `${rotulo}: 18 antes da pagina de assinatura`);
  // 16: o quadro do total logo depois do titulo; a condicao de pagamento depois dele e antes do 17
  const pTotal = pos('Valor Total dos Serviços');
  assert.ok(pTotal > posicoes[15] && pTotal < posicoes[16], `${rotulo}: o quadro do total fora do 16`);
  const pCond = pos('1ª Parcela – Entrada:');
  assert.ok(pCond > pTotal && pCond < posicoes[16], `${rotulo}: a condicao de pagamento fora do lugar`);
  // o que NAO e da proposta de origem
  for (const fora of ['Equipamento:', 'equip-photo', 'Tabela de Preços', 'FINAME', 'IMPOSTOS E CLASSIFICAÇÕES FISCAIS', '5. CONDIÇÕES GERAIS', '4. ESCOPO DE FORNECIMENTO']) {
    assert.ok(!c.includes(fora), `${rotulo}: "${fora}" nao e da proposta de origem`);
  }
  assert.strictEqual(ocorrencias(h, '1ª Parcela – Entrada:'), 1, `${rotulo}: a condicao de pagamento saiu mais de uma vez`);
  assert.strictEqual(ocorrencias(h, 'O CLIENTE declara ter recebido as informações necessárias'), 1, `${rotulo}: a 12 saiu mais de uma vez`);
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

test('PC-02 subir de novo nao duplica o modelo nem as clausulas; modelo antigo no banco e ressincronizado com o codigo', async () => {
  await descer();
  // Simula o banco de producao com a versao da manha (numeracao de equipamento): a subida tem de trazer de volta a do codigo.
  await escreverBanco("UPDATE clausulas_modelo_itens SET numero = '5.1' WHERE titulo = 'ESCOPO TÉCNICO' AND modelo_id = (SELECT id FROM clausulas_modelo WHERE nome = 'Projeto Conceitual')");
  token = await subir();
  await pausa(3500); // o ressincronizar roda 3 s depois da subida
  const doBanco = await lerBanco("SELECT numero, titulo FROM clausulas_modelo_itens WHERE modelo_id = (SELECT id FROM clausulas_modelo WHERE nome = 'Projeto Conceitual') ORDER BY ordem");
  assert.deepStrictEqual(doBanco.map((x) => `${x.numero} ${x.titulo}`), MODELO.map((x) => `${x.numero} ${x.titulo}`), 'o modelo do banco nao voltou ao do codigo');
  const modelos = await lerBanco("SELECT id FROM clausulas_modelo WHERE nome = 'Projeto Conceitual'");
  assert.strictEqual(modelos.length, 1);
  const itensM = await lerBanco('SELECT COUNT(*) AS n FROM clausulas_modelo_itens WHERE modelo_id = ?', [modelos[0].id]);
  assert.strictEqual(itensM[0].n, MODELO.length);
});

test('PC-05 pela rota do preview: so Projeto Conceitual -> capa de servicos e sem FINAME; misturado com equipamento -> como antes', async () => {
  const [{ id: idPc }] = await lerBanco("SELECT id FROM clausulas_modelo WHERE nome = 'Projeto Conceitual'");
  // a familia com o modelo escrita em outra caixa que a do item: o casamento e o mesmo do contrato
  await escreverBanco('INSERT INTO familias_produto (nome, clausulas_modelo_id) VALUES (?, ?)', ['Projeto Conceitual GMP', idPc]);
  await escreverBanco('INSERT INTO familias_produto (nome) VALUES (?)', ['Masseira Teste PC']);
  const nova = async (numero, familias) => {
    const r = await escreverBanco("INSERT INTO propostas (numero_proposta, titulo) VALUES (?, 'PROJETO CONCEITUAL – NOVA UNIDADE FABRIL')", [numero]);
    for (const f of familias) {
      await escreverBanco('INSERT INTO proposta_itens (proposta_id, descricao, quantidade, valor_unitario, valor_total, familia_produto) VALUES (?, ?, 1, 1000, 1000, ?)',
        [r.lastID, 'Item ' + f, f]);
    }
    return r.lastID;
  };
  const soServico = await nova('PC-05-A', ['PROJETO CONCEITUAL GMP']);
  const misturada = await nova('PC-05-B', ['PROJETO CONCEITUAL GMP', 'Masseira Teste PC']);

  const preview = async (id) => {
    const r = await fetch(`http://127.0.0.1:${porta}/api/propostas/${id}/premium`, {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(120000),
    });
    const corpo = await r.text();
    assert.strictEqual(r.status, 200, corpo.slice(0, 300));
    return corpo;
  };
  const hServico = await preview(soServico);
  assert.ok(hServico.includes(CAPA_SERVICO), 'a capa da proposta so de Projeto Conceitual nao diz servicos especializados');
  assert.ok(!hServico.includes(CAPA_EQUIP), 'a capa da proposta so de Projeto Conceitual ainda diz equipamentos');
  assert.ok(!hServico.includes(FINAME), 'a proposta so de Projeto Conceitual ainda mostra a tabela FINAME');
  assert.ok(hServico.includes('PROJETO CONCEITUAL – NOVA UNIDADE FABRIL'), 'o titulo da proposta sumiu da capa');

  const hMista = await preview(misturada);
  assert.ok(hMista.includes(CAPA_EQUIP) && !hMista.includes(CAPA_SERVICO), 'misturada com equipamento a capa deixou de ser a de equipamentos');
  assert.ok(hMista.includes(FINAME), 'misturada com equipamento a tabela FINAME sumiu');
  await descer();
});

// ── a regra da capa no template (as bordas) ──────────────────────────────────────────────
const capa = (familias, modeloPorFamilia, grupoPorFamilia) => gerarHTMLPropostaPremiumV2(
  proposta,
  familias.map((f, i) => ({ produto_nome: 'Item ' + i, descricao: 'd', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100, familia_produto: f, especificacoes_tecnicas: '{}' })),
  totais,
  { ...(modeloPorFamilia === undefined ? {} : { modelo_por_familia: modeloPorFamilia }), ...(grupoPorFamilia ? { grupo_por_familia: grupoPorFamilia } : {}) },
  null, false, true,
);
const ehServico = (h) => h.includes(CAPA_SERVICO) && !h.includes(CAPA_EQUIP) && !h.includes(FINAME);
const ehEquip = (h) => h.includes(CAPA_EQUIP) && !h.includes(CAPA_SERVICO) && h.includes(FINAME);

test('PC-06 capa: nome do modelo sem depender de acento e caixa; familia casada sem caixa', () => {
  assert.ok(ehServico(capa(['Projeto Conceitual GMP'], { 'PROJETO CONCEITUAL GMP': 'PROJETO CONCEITUAL' })));
  assert.ok(ehServico(capa(['PC A', 'PC B'], { 'PC A': 'Projeto Conceitual', 'PC B': 'projeto conceitual' })), 'duas familias no mesmo modelo de servico');
});

test('PC-06 capa: na duvida fica a de equipamentos (sem mapa, item sem familia, familia sem modelo, outro modelo)', () => {
  assert.ok(ehEquip(capa(['PC A'], undefined)), 'sem o mapa');
  assert.ok(ehEquip(capa(['PC A', ''], { 'PC A': 'Projeto Conceitual' })), 'item sem familia');
  assert.ok(ehEquip(capa(['PC A', 'Masseira'], { 'PC A': 'Projeto Conceitual' })), 'familia sem modelo');
  assert.ok(ehEquip(capa(['PC A', 'Disco'], { 'PC A': 'Projeto Conceitual', Disco: 'Hélices e Discos' })), 'outro modelo');
});

test('PC-06 capa: proposta so de pecas continua como era (titulo de pecas, sem FINAME)', () => {
  const h = capa(['Disco'], { Disco: 'Hélices e Discos' }, { Disco: 'Hélices e Acessórios' });
  assert.ok(h.includes('PROPOSTA PARA FORNECIMENTO DE PEÇAS E ACESSÓRIOS') && !h.includes(CAPA_SERVICO) && !h.includes(FINAME));
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
