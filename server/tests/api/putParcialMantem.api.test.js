/**
 * Etapa 138 (nucleo/propostas) — o payload parcial que zerava colunas nos `PUT`, pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-01 proposta: a chave ausente mantem a coluna (titulo so, status so, o payload da tela que nao carrega 8 colunas)
 *   RN-02 proposta: a chave presente vazia ou nula limpa, com a transformacao de hoje
 *   RN-03 proposta: `itens` ausente nao toca nos itens (nem nas variaveis manuais, nem no historico); presente: o de hoje
 *   RN-04 proposta: a revisao so sobe se `itens` ou `valor_total` vieram e mudaram
 *   RN-05 proposta: motivo da nao venda, desconto acima de 5% e data de fechamento pelo valor efetivo
 *   RN-06 proposta: as excecoes (html_rendered sempre limpo, probabilidade nula mantem, responsavel ausente mantem)
 *   RN-07 obrigatorio presente e vazio -> 400 com a mensagem da criacao (titulo da proposta e da oportunidade, razao social)
 *   RN-09 cliente: ausente mantem; o payload da tela (objeto inteiro) grava como hoje
 *   RN-10 oportunidade: ausente mantem
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa138-payload-parcial-nos-put.md
 * Molde: usuarioExclusaoCorrida.api.test.js (pasta vazia, porta livre, morreComOPai, RATE_LIMIT_MAX). O banco e preparado e lido por uma
 * conexao crua ao arquivo (o servidor de pe, busy_timeout).
 * Executar: cd server && node tests/api/putParcialMantem.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');

const SERVER_DIR = path.join(__dirname, '..', '..');
const L_RAZAO = 'Razão social é obrigatória';
const L_TITULO = 'Título é obrigatório';
const L_MOTIVO = 'Motivo da não venda é obrigatório quando a proposta está perdida/rejeitada.';
const L_DESC = 'Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada.';
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
const SEED = { email: 'e138seed@t.com', senha: 'E138seed!senha' };
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

const linhaP = (id) => get('SELECT * FROM propostas WHERE id = ?', [id]);
const itensP = (id) => all('SELECT id, descricao, codigo_produto, modelo FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [id]);
/** O que mudou entre duas linhas, fora as colunas ignoradas. */
function mudou(antes, depois, ignorar = ['updated_at', 'html_rendered']) {
  const out = {};
  for (const k of Object.keys(antes)) if (!ignorar.includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) out[k] = [antes[k], depois[k]];
  return out;
}

async function novoCliente() {
  const [s, c] = await j('POST', '/clientes', ctx.T, {
    razao_social: `Cli ${++ctx.n}`, nome_fantasia: 'Fant', cnpj: '11.222.333/0001-44', segmento: 'Seg', telefone: '(11) 9999-0000', email: 'a@a.com',
    endereco: 'Rua A', cidade: 'Sao Paulo', estado: 'SP', cep: '01000-000', contato_principal: 'Joao', observacoes: 'obs',
  });
  assert.strictEqual(s, 200, JSON.stringify(c));
  await run("UPDATE clientes SET logo_url = 'logo-138.png' WHERE id = ?", [c.id]);
  return c.id;
}
const ITENS = [
  { descricao: 'Item 1', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100, codigo_produto: 'P1' },
  { descricao: 'Item 2', quantidade: 2, unidade: 'UN', valor_unitario: 100, valor_total: 200, codigo_produto: 'P2' },
];
/** Proposta com todas as colunas que a varredura mede, dois itens (um com modelo) e uma variavel manual. */
async function novaProposta(extra = {}) {
  const [s, p] = await j('POST', '/propostas', ctx.T, {
    cliente_id: ctx.clienteId, projeto_id: ctx.projetoId, titulo: 'Prop', descricao: 'desc', valor_total: 300, validade: '2026-12-31',
    condicoes_pagamento: 'cp', prazo_entrega: 'pe', garantia: 'g', observacoes: 'o', status: 'rascunho', margem_desconto: 2,
    tipo_proposta: 'tecnica', expira_em: '2026-12-30', cliente_contato: 'Maria', cliente_telefone: '1188', cliente_email: 'm@m.com',
    idioma: 'pt-BR', moeda: 'BRL', incoterm: 'FOB', unidade_negocio: 'UN1', origem_busca: 'site', familia_produto: 'FAM',
    lembrete_data: '2026-11-01', lembrete_mensagem: 'ligar', probabilidade: 70, oportunidade_id: ctx.opId,
    itens: ITENS, ...extra,
  });
  assert.strictEqual(s, 200, JSON.stringify(p));
  const its = await itensP(p.id);
  await run("UPDATE proposta_itens SET modelo = 'M-1' WHERE id = ?", [its[0].id]);
  const [sv] = await j('PUT', `/propostas/${p.id}/variaveis-manuais`, ctx.T, { valores: [{ item_id: its[0].id, chave: 'k138', valor: 'v138' }] });
  assert.strictEqual(sv, 200);
  await run("UPDATE propostas SET html_rendered = '<html>retrato</html>' WHERE id = ?", [p.id]);
  return p.id;
}
const varManual = (id) => all('SELECT item_id, chave, valor FROM proposta_variaveis_manuais WHERE proposta_id = ?', [id]);
const logItens = async (id) => (await get("SELECT COUNT(*) n FROM proposta_edicoes_log WHERE proposta_id = ? AND tipo LIKE 'item_%'", [id])).n;

/** Manda o corpo e confere que SO as colunas esperadas mudaram (e os itens, a variavel e o historico de itens, nao). */
async function soMudou(id, corpo, esperado) {
  const a = await linhaP(id); const ia = await itensP(id); const va = await varManual(id); const la = await logItens(id);
  const r = await j('PUT', `/propostas/${id}`, ctx.T, corpo);
  assert.strictEqual(r[0], 200, `PUT ${JSON.stringify(corpo)} -> ${r[0]} ${JSON.stringify(r[1])}`);
  const d = await linhaP(id);
  assert.deepStrictEqual(mudou(a, d), esperado, `PUT ${JSON.stringify(corpo)}`);
  assert.deepStrictEqual(await itensP(id), ia, 'os itens mudaram');
  assert.deepStrictEqual(await varManual(id), va, 'a variavel manual mudou');
  assert.strictEqual(await logItens(id), la, 'o historico ganhou entrada de item');
  return d;
}

// ── RN-01 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-01a] PUT {titulo} -> so o titulo muda; itens, variavel manual, revisao e numero intactos', async () => {
  const id = await novaProposta();
  await soMudou(id, { titulo: 'Prop novo' }, { titulo: ['PROP', 'PROP NOVO'] });
});

test('[RN-01b] PUT {status} sem titulo -> 200 e so o status muda (antes: 500 de banco)', async () => {
  const id = await novaProposta();
  await soMudou(id, { status: 'enviada' }, { status: ['rascunho', 'enviada'] });
});

test('[RN-01c] o payload da tela (sem as 8 colunas que ela nao carrega) mantem projeto, contatos, idioma, moeda, incoterm, unidade', async () => {
  const id = await novaProposta();
  const [, g] = await j('GET', `/propostas/${id}`, ctx.T);
  const a = await linhaP(id);
  // os campos que o PropostaForm manda (client/src/components/proposta/payloadProposta.js), com os itens como a tela os devolve
  const tela = {
    numero_proposta: g.numero_proposta, cliente_id: g.cliente_id, titulo: g.titulo, descricao: g.descricao, validade: g.validade,
    condicoes_pagamento: g.condicoes_pagamento, prazo_entrega: g.prazo_entrega, garantia: g.garantia, observacoes: g.observacoes,
    oportunidade_id: g.oportunidade_id, tipo_proposta: g.tipo_proposta, expira_em: g.expira_em, responsavel_id: g.responsavel_id,
    margem_desconto: g.margem_desconto, valor_total: g.valor_total, status: g.status, origem_busca: g.origem_busca, motivo_nao_venda: null,
    familia_produto: g.familia_produto, lembrete_data: g.lembrete_data, lembrete_mensagem: g.lembrete_mensagem, probabilidade: 70,
    data_fechamento: null,
    itens: (g.itens || []).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, valor_unitario: i.valor_unitario,
      valor_total: i.valor_total, codigo_produto: i.codigo_produto, familia_produto: i.familia_produto || null, regiao_busca: null,
      desconto_percentual: 0, preco_tabela: null, acessorios: '[]' })),
  };
  const r = await j('PUT', `/propostas/${id}`, ctx.T, tela);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const d = await linhaP(id);
  for (const k of ['projeto_id', 'cliente_contato', 'cliente_telefone', 'cliente_email', 'idioma', 'moeda', 'incoterm', 'unidade_negocio']) {
    assert.strictEqual(d[k], a[k], `${k} zerou (${JSON.stringify(a[k])} -> ${JSON.stringify(d[k])})`);
  }
  assert.ok(a.projeto_id && a.cliente_contato === 'MARIA' && a.idioma === 'pt-BR', `o preparo nao gravou: ${JSON.stringify(a)}`);
  assert.strictEqual(d.revisao, a.revisao, 'a tela sem mudar nada subiu a revisao');
  assert.strictEqual((await itensP(id))[0].modelo, 'M-1', 'a mesclagem dos itens deixou de preservar o modelo');
});

// ── RN-02 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-02] presente vazio ou nulo limpa, com a transformacao de hoje', async () => {
  const id = await novaProposta();
  await soMudou(id, { tipo_proposta: null, data_fechamento: null, descricao: '', condicoes_pagamento: '', cliente_contato: '', expira_em: null, oportunidade_id: null }, {
    tipo_proposta: ['tecnica', null], descricao: ['DESC', ''], condicoes_pagamento: ['CP', ''], cliente_contato: ['MARIA', null],
    expira_em: ['2026-12-30', null], oportunidade_id: [ctx.opId, null],
  });
  // e o vazio de texto que hoje vira null continua null
  await soMudou(id, { tipo_proposta: '', origem_busca: '' }, { origem_busca: ['SITE', null] });
});

// ── RN-03 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-03] itens ausente nao toca nos itens; itens [] apaga todos (o de hoje)', async () => {
  const id = await novaProposta();
  await soMudou(id, { garantia: '12 meses' }, { garantia: ['G', '12 MESES'] });
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { itens: [] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await itensP(id), [], 'itens [] nao apagou');
  assert.strictEqual((await linhaP(id)).titulo, 'PROP', 'itens [] mexeu no titulo');
});

test('[RN-03b] itens presente numa proposta com variavel manual -> 200 (antes nunca respondia: chaveDe is not defined, C296), mesclagem e variavel religada', async () => {
  const id = await novaProposta();
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { itens: ITENS.map((i) => ({ ...i })) });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const its = await itensP(id);
  assert.deepStrictEqual(its.map((i) => [i.descricao, i.modelo]), [['ITEM 1', 'M-1'], ['ITEM 2', null]]);
  assert.deepStrictEqual((await varManual(id)).map((v) => v.item_id), [its[0].id], 'a variavel manual nao foi religada ao item novo');
});

// ── RN-04 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-04] a revisao so sobe se valor_total (ou itens) veio e mudou; o sufixo REV acompanha', async () => {
  const id = await novaProposta();
  const a = await linhaP(id);
  assert.match(a.numero_proposta, /REV00$/, a.numero_proposta);
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { valor_total: 400 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const d = await linhaP(id);
  assert.deepStrictEqual([d.revisao, d.valor_total], [1, 400]);
  assert.strictEqual(d.numero_proposta, a.numero_proposta.replace(/REV00$/, 'REV01'), 'o sufixo nao acompanhou (cliente_id ausente do corpo)');
  assert.strictEqual((await itensP(id)).length, 2, 'valor_total sozinho apagou os itens');
  // o registro da revisao compara pelos valores efetivos: so o valor mudou
  const rev = await get('SELECT mudancas FROM proposta_revisoes WHERE proposta_id = ? ORDER BY id DESC LIMIT 1', [id]);
  assert.ok(rev, 'a revisao nao foi registrada');
  assert.deepStrictEqual(JSON.parse(rev.mudancas).map((m) => m.campo), ['Valor Total'], rev.mudancas);
  // e o titulo sozinho nao sobe
  await soMudou(id, { titulo: 'Sem revisao' }, { titulo: ['PROP', 'SEM REVISAO'] });
});

// ── RN-05 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-05a] o motivo da nao venda pelo efetivo', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'rejeitada', motivo_nao_venda = 'CARO' WHERE id = ?", [id]);
  await soMudou(id, { titulo: 'Rejeitada edit' }, { titulo: ['PROP', 'REJEITADA EDIT'] });
  let r = await j('PUT', `/propostas/${id}`, ctx.T, { motivo_nao_venda: '' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_MOTIVO]);
  assert.strictEqual((await linhaP(id)).motivo_nao_venda, 'CARO');
  // a regra so roda quando o status ou o motivo vieram: uma rejeitada antiga SEM motivo continua editavel
  await run("UPDATE propostas SET motivo_nao_venda = NULL WHERE id = ?", [id]);
  await soMudou(id, { garantia: 'legado' }, { garantia: ['G', 'LEGADO'] });
  const id2 = await novaProposta();
  r = await j('PUT', `/propostas/${id2}`, ctx.T, { status: 'rejeitada' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_MOTIVO]);
  assert.strictEqual((await linhaP(id2)).status, 'rascunho');
  // a metade positiva: status e motivo juntos passam, e o motivo e gravado
  await soMudou(id2, { status: 'rejeitada', motivo_nao_venda: 'prazo' }, { status: ['rascunho', 'rejeitada'], motivo_nao_venda: [null, 'PRAZO'],
    data_fechamento: [null, new Date().toISOString().split('T')[0]] });
});

test('[RN-05b] o desconto acima de 5% pela margem gravada: so o status nao fura a aprovacao', async () => {
  const id = await novaProposta();
  await run('UPDATE propostas SET margem_desconto = 10 WHERE id = ?', [id]);
  const a = await linhaP(id);
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { status: 'enviada' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [403, L_DESC]);
  assert.deepStrictEqual(mudou(a, await linhaP(id), ['html_rendered']), {}, 'a recusa gravou algo');
  await soMudou(id, { titulo: 'Com desconto' }, { titulo: ['PROP', 'COM DESCONTO'] });
  // a metade positiva: com a aprovacao do desconto, o mesmo status passa
  await run("INSERT INTO aprovacoes (proposta_id, tipo, valor_desconto, status, solicitado_por) VALUES (?, 'desconto', 10, 'aprovado', (SELECT MIN(id) FROM usuarios))", [id]);
  await soMudou(id, { status: 'enviada' }, { status: ['rascunho', 'enviada'] });
});

test('[RN-05c] a data de fechamento automatica pelo efetivo', async () => {
  const hoje = new Date().toISOString().split('T')[0];
  const id = await novaProposta();
  await soMudou(id, { status: 'aprovada' }, { status: ['rascunho', 'aprovada'], data_fechamento: [null, hoje] });
  await run("UPDATE propostas SET data_fechamento = '2026-01-02' WHERE id = ?", [id]);
  await soMudou(id, { titulo: 'Aprovada edit' }, { titulo: ['PROP', 'APROVADA EDIT'] });
  assert.strictEqual((await linhaP(id)).data_fechamento, '2026-01-02');
  // (f) aprovar de novo uma proposta que ja tem data: a data fica
  await run("UPDATE propostas SET status = 'enviada' WHERE id = ?", [id]);
  await soMudou(id, { status: 'aprovada' }, { status: ['enviada', 'aprovada'] });
});

test('[RN-05d] PUT {status: enviada} numa rejeitada limpa o motivo (so rejeitada guarda motivo, como hoje)', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'rejeitada', motivo_nao_venda = 'CARO' WHERE id = ?", [id]);
  await soMudou(id, { status: 'enviada' }, { status: ['rejeitada', 'enviada'], motivo_nao_venda: ['CARO', null] });
});

test('[RN-05e] PUT {margem_desconto: 10} numa enviada sem aprovacao -> 403 (antes: 200 e o status apagado)', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'enviada' WHERE id = ?", [id]);
  const a = await linhaP(id);
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { margem_desconto: 10 });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [403, L_DESC]);
  assert.deepStrictEqual(mudou(a, await linhaP(id), ['html_rendered']), {}, 'a recusa gravou algo');
  // a metade positiva: a mesma margem num rascunho passa (a regra so vale fora do rascunho)
  await run("UPDATE propostas SET status = 'rascunho' WHERE id = ?", [id]);
  await soMudou(id, { margem_desconto: 10 }, { margem_desconto: [2, 10] });
});

// ── RN-06 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-06] html_rendered limpo em todo salvamento; probabilidade nula e responsavel ausente mantem', async () => {
  const id = await novaProposta();
  const a = await linhaP(id);
  assert.strictEqual(a.html_rendered, '<html>retrato</html>');
  await soMudou(id, { titulo: 'Retrato' }, { titulo: ['PROP', 'RETRATO'] });
  const d = await linhaP(id);
  assert.strictEqual(d.html_rendered, null, 'o retrato do PDF nao foi invalidado');
  assert.deepStrictEqual([d.probabilidade, d.responsavel_id], [70, a.responsavel_id]);
  await soMudou(id, { probabilidade: null }, {});
  assert.strictEqual((await linhaP(id)).probabilidade, 70);
});

// ── RN-07 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-07] titulo / razao social presente e vazio -> 400 com a mensagem da criacao, nada gravado', async () => {
  const id = await novaProposta();
  for (const t of ['', '   ', null]) {
    const a = await linhaP(id);
    const r = await j('PUT', `/propostas/${id}`, ctx.T, { titulo: t, descricao: 'nao grava' });
    assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_TITULO], `titulo ${JSON.stringify(t)}`);
    assert.deepStrictEqual(mudou(a, await linhaP(id), []), {}, `titulo ${JSON.stringify(t)} gravou`);
  }
  // a ordem: a proposta que nao existe e 404 antes do titulo vazio
  let r404 = await j('PUT', '/propostas/999138', ctx.T, { titulo: '' });
  assert.deepStrictEqual([r404[0], r404[1] && r404[1].error], [404, 'Proposta não encontrada']);
  // titulo vazio antes do motivo e do desconto
  await run("UPDATE propostas SET margem_desconto = 10 WHERE id = ?", [id]);
  r404 = await j('PUT', `/propostas/${id}`, ctx.T, { titulo: ' ', status: 'rejeitada' });
  assert.deepStrictEqual([r404[0], r404[1] && r404[1].error], [400, L_TITULO]);
  r404 = await j('PUT', `/propostas/${id}`, ctx.T, { status: 'rejeitada' });
  assert.deepStrictEqual([r404[0], r404[1] && r404[1].error], [400, L_MOTIVO], 'o motivo vem antes do desconto');
  const c = await novoCliente();
  for (const t of ['', '  ', null]) {
    const a = await get('SELECT * FROM clientes WHERE id = ?', [c]);
    const r = await j('PUT', `/clientes/${c}`, ctx.T, { razao_social: t, telefone: 'nao grava' });
    assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_RAZAO], `razao ${JSON.stringify(t)}`);
    assert.deepStrictEqual(mudou(a, await get('SELECT * FROM clientes WHERE id = ?', [c]), []), {});
  }
  for (const t of ['', '  ', null]) {
    const a = await get('SELECT * FROM oportunidades WHERE id = ?', [ctx.opId]);
    const r = await j('PUT', `/oportunidades/${ctx.opId}`, ctx.T, { titulo: t });
    assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_TITULO], `oportunidade ${JSON.stringify(t)}`);
    assert.deepStrictEqual(mudou(a, await get('SELECT * FROM oportunidades WHERE id = ?', [ctx.opId]), []), {});
  }
});

// ── RN-09 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-09] cliente: ausente mantem (telefone so; razao social so); logo vazia limpa', async () => {
  const c = await novoCliente();
  const gC = () => get('SELECT * FROM clientes WHERE id = ?', [c]);
  let a = await gC();
  let r = await j('PUT', `/clientes/${c}`, ctx.T, { telefone: '(21) 2222-3333' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await gC(), ['updated_at']), { telefone: ['(11) 9999-0000', '(21) 2222-3333'] });
  a = await gC();
  r = await j('PUT', `/clientes/${c}`, ctx.T, { razao_social: 'acme nova' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await gC(), ['updated_at']), { razao_social: [a.razao_social, 'ACME NOVA'] });
  a = await gC();
  r = await j('PUT', `/clientes/${c}`, ctx.T, { logo_url: '' });
  assert.deepStrictEqual(mudou(a, await gC(), ['updated_at']), { logo_url: ['logo-138.png', null] });
  // corpo sem coluna conhecida: 200, nada muda
  a = await gC();
  r = await j('PUT', `/clientes/${c}`, ctx.T, {});
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await gC(), ['updated_at']), {});
});

test('[RN-09] cliente: o payload da tela (o objeto inteiro do GET, com um campo apagado) grava como hoje', async () => {
  const c = await novoCliente();
  const [, g] = await j('GET', `/clientes/${c}`, ctx.T);
  const a = await get('SELECT * FROM clientes WHERE id = ?', [c]);
  const r = await j('PUT', `/clientes/${c}`, ctx.T, { ...g, email: '', cidade: 'rio' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await get('SELECT * FROM clientes WHERE id = ?', [c]), ['updated_at']), { email: ['a@a.com', ''], cidade: ['SAO PAULO', 'RIO'] });
});

// ── RN-10 ─────────────────────────────────────────────────────────────────────────────────
test('[RN-10] oportunidade: ausente mantem (etapa so; titulo so)', async () => {
  const [s, op] = await j('POST', '/oportunidades', ctx.T, { cliente_id: ctx.clienteId, titulo: 'Op', descricao: 'd', valor_estimado: 1000, probabilidade: 70, etapa: 'negociacao', status: 'ativa' });
  assert.strictEqual(s, 200, JSON.stringify(op));
  const gO = () => get('SELECT * FROM oportunidades WHERE id = ?', [op.id]);
  let a = await gO();
  let r = await j('PUT', `/oportunidades/${op.id}`, ctx.T, { etapa: 'fechamento' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await gO(), ['updated_at']), { etapa: ['NEGOCIACAO', 'FECHAMENTO'] });
  a = await gO();
  r = await j('PUT', `/oportunidades/${op.id}`, ctx.T, { titulo: 'Op2' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await gO(), ['updated_at']), { titulo: ['OP', 'OP2'] });
  a = await gO();
  r = await j('PUT', `/oportunidades/${op.id}`, ctx.T, { foo: 1 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(mudou(a, await gO(), ['updated_at']), {});
});

(async () => {
  console.log('\n=== Etapa 138 (nucleo/propostas): o payload parcial nos PUT — ausente mantem, presente grava ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e138-put-'));
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 15000);
    ctx.clienteId = await novoCliente();
    const [sp, pj] = await j('POST', '/projetos', ctx.T, { cliente_id: ctx.clienteId, nome: 'Proj 138' });
    assert.strictEqual(sp, 200, JSON.stringify(pj));
    ctx.projetoId = pj.id;
    const [so, op] = await j('POST', '/oportunidades', ctx.T, { cliente_id: ctx.clienteId, titulo: 'Op base', etapa: 'prospeccao' });
    assert.strictEqual(so, 200, JSON.stringify(op));
    ctx.opId = op.id;
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
