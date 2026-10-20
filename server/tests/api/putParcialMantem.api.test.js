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
    data_fechamento: [null, require('../../services/diaLocal').hojeLocalISO()] }); // Etapa 165: o dia de Brasilia (B1056)
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
  // Etapa 140 (B912): a aprovacao que vale foi decidida por OUTRA pessoa — a sem decisor (ou decidida por quem pediu) nao libera mais.
  const [su, u2] = await j('POST', '/usuarios', ctx.T, { nome: 'Aprov 138', email: `aprov138-${Date.now()}@t.com`, senha: 'Senha!138', cargo: 'C', role: 'usuario', setor: '', pode_aprovar_descontos: 1 });
  assert.strictEqual(su, 200, JSON.stringify(u2));
  await run("INSERT INTO aprovacoes (proposta_id, tipo, valor_desconto, status, solicitado_por, aprovado_por) VALUES (?, 'desconto', 10, 'aprovado', (SELECT MIN(id) FROM usuarios), ?)", [id, u2.id]);
  await soMudou(id, { status: 'enviada' }, { status: ['rascunho', 'enviada'] });
});

test('[RN-05c] a data de fechamento automatica pelo efetivo', async () => {
  const hoje = require('../../services/diaLocal').hojeLocalISO(); // Etapa 165: o dia de Brasilia (B1056)
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

// ── Fase 5 ────────────────────────────────────────────────────────────────────────────────
test('[RN-13] trocar o cliente apaga o contato e o projeto da proposta que nao vieram (eram do cliente anterior)', async () => {
  const id = await novaProposta();
  const outro = await novoCliente();
  const a = await linhaP(id);
  assert.ok(a.cliente_contato && a.projeto_id, JSON.stringify(a));
  let r = await j('PUT', `/propostas/${id}`, ctx.T, { cliente_id: outro, titulo: 'Troca' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  let d = await linhaP(id);
  assert.deepStrictEqual([d.cliente_id, d.cliente_contato, d.cliente_telefone, d.cliente_email, d.projeto_id], [outro, null, null, null, null]);
  assert.deepStrictEqual([d.idioma, d.moeda, d.incoterm], [a.idioma, a.moeda, a.incoterm], 'a troca de cliente apagou o que nao e do cliente');
  // o que veio junto com a troca fica
  r = await j('PUT', `/propostas/${id}`, ctx.T, { cliente_id: ctx.clienteId, cliente_contato: 'novo contato' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  d = await linhaP(id);
  assert.deepStrictEqual([d.cliente_id, d.cliente_contato, d.cliente_telefone], [ctx.clienteId, 'NOVO CONTATO', null]);
  // o mesmo cliente mandado de novo nao apaga nada (RN-01c)
  await soMudou(id, { cliente_id: ctx.clienteId, titulo: 'Mesmo cliente' }, { titulo: ['TROCA', 'MESMO CLIENTE'] });
});

const L_CONFLITO = 'A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo.';
const furaDesconto = async (id) => {
  const p = await linhaP(id);
  const aprov = (await get("SELECT COUNT(*) n FROM aprovacoes WHERE proposta_id = ? AND status = 'aprovado'", [id])).n;
  return !['rascunho', 'desconto_aprovado'].includes(p.status) && Number(p.margem_desconto) > 5 && aprov === 0 ? JSON.stringify([p.status, p.margem_desconto]) : null;
};
const aceitos = (r) => r[0] === 200 || (r[0] === 403 && r[1].error === L_DESC) || (r[0] === 409 && r[1].error === L_CONFLITO);

test('[RN-14] duas gravacoes parciais ao mesmo tempo (so a margem 20 x so o status enviada) nao furam o desconto: 409 para a que leu velho', async () => {
  const furos = []; let conflitos = 0;
  for (let k = 0; k < 8; k++) {
    const id = await novaProposta();
    const rs = await Promise.all([
      j('PUT', `/propostas/${id}`, ctx.T, { margem_desconto: 20 }),
      j('PUT', `/propostas/${id}`, ctx.T, { status: 'enviada' }),
    ]);
    for (const r of rs) assert.ok(aceitos(r), `rodada ${k}: ${JSON.stringify(r)}`);
    conflitos += rs.filter((r) => r[0] === 409).length;
    // toda resposta 200 esta no banco (a outra nao grava o campo dela): sem isto, um 409 trocado por 200 calado passaria
    const p = await linhaP(id);
    if (rs[0][0] === 200) assert.strictEqual(Number(p.margem_desconto), 20, `rodada ${k}: a margem respondeu 200 e nao gravou`);
    if (rs[1][0] === 200) assert.strictEqual(p.status, 'enviada', `rodada ${k}: o status respondeu 200 e nao gravou`);
    const f = await furaDesconto(id);
    if (f) furos.push(`rodada ${k}: ${f}`);
  }
  assert.deepStrictEqual(furos, [], `enviada com desconto acima de 5% sem aprovacao (conflitos: ${conflitos})`);
});

test('[RN-14] a tela salvando rascunho com margem 20 ao mesmo tempo que so o status enviada pela API: nao fura', async () => {
  const furos = [];
  for (let k = 0; k < 6; k++) {
    const id = await novaProposta();
    const [, g] = await j('GET', `/propostas/${id}`, ctx.T);
    const tela = { cliente_id: g.cliente_id, titulo: g.titulo, status: 'rascunho', margem_desconto: 20, valor_total: g.valor_total, motivo_nao_venda: null,
      data_fechamento: null, tipo_proposta: g.tipo_proposta, itens: (g.itens || []).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total, codigo_produto: i.codigo_produto, acessorios: '[]' })) };
    const rs = await Promise.all([j('PUT', `/propostas/${id}`, ctx.T, tela), j('PUT', `/propostas/${id}`, ctx.T, { status: 'enviada' })]);
    for (const r of rs) assert.ok(aceitos(r), `rodada ${k}: ${JSON.stringify(r)}`);
    const f = await furaDesconto(id);
    if (f) furos.push(`rodada ${k}: ${f}`);
  }
  assert.deepStrictEqual(furos, []);
});

test('[RN-14] rejeitar com motivo ao mesmo tempo que apagar o motivo nao deixa rejeitada sem motivo', async () => {
  const furos = [];
  for (let k = 0; k < 8; k++) {
    const id = await novaProposta();
    const rs = await Promise.all([
      j('PUT', `/propostas/${id}`, ctx.T, { status: 'rejeitada', motivo_nao_venda: 'preco' }),
      j('PUT', `/propostas/${id}`, ctx.T, { motivo_nao_venda: '' }),
    ]);
    for (const r of rs) assert.ok(r[0] === 200 || (r[0] === 400 && r[1].error === L_MOTIVO) || (r[0] === 409 && r[1].error === L_CONFLITO), `rodada ${k}: ${JSON.stringify(r)}`);
    const p = await linhaP(id);
    if (p.status === 'rejeitada' && !p.motivo_nao_venda) furos.push(`rodada ${k}`);
    if (rs[0][0] === 200) assert.deepStrictEqual([p.status, p.motivo_nao_venda], ['rejeitada', 'PRECO'], `rodada ${k}: rejeitar respondeu 200 e nao gravou`);
    else if (rs[1][0] === 200) assert.strictEqual(p.motivo_nao_venda, null, `rodada ${k}: apagar o motivo respondeu 200 e nao gravou`);
  }
  assert.deepStrictEqual(furos, [], 'rejeitada sem motivo');
});

test('[RN-15] o numero, a revisao e o responsavel so entram na gravacao quando mudam (nao desfazem uma renumeracao feita no meio)', async () => {
  const id = await novaProposta();
  await run('CREATE TABLE IF NOT EXISTS e138_toque (coluna TEXT)');
  await run('DELETE FROM e138_toque');
  for (const c of ['numero_proposta', 'revisao', 'responsavel_id']) {
    await run(`DROP TRIGGER IF EXISTS e138_toque_${c}`);
    await run(`CREATE TRIGGER e138_toque_${c} AFTER UPDATE OF ${c} ON propostas WHEN NEW.id = ${id} BEGIN INSERT INTO e138_toque (coluna) VALUES ('${c}'); END`);
  }
  try {
    await soMudou(id, { titulo: 'Sem toque' }, { titulo: ['PROP', 'SEM TOQUE'] });
    assert.deepStrictEqual((await all('SELECT coluna FROM e138_toque')).map((x) => x.coluna), [], 'o PUT {titulo} regravou numero/revisao/responsavel');
    // a metade positiva: o valor que muda a revisao toca o numero e a revisao
    const r = await j('PUT', `/propostas/${id}`, ctx.T, { valor_total: 999 });
    assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
    assert.deepStrictEqual((await all('SELECT coluna FROM e138_toque ORDER BY coluna')).map((x) => x.coluna), ['numero_proposta', 'revisao']);
  } finally {
    for (const c of ['numero_proposta', 'revisao', 'responsavel_id']) await run(`DROP TRIGGER IF EXISTS e138_toque_${c}`);
  }
});

// ── Fase 5, revisor de sabotagem (r3): cada cenario nomeia as sabotagens sobreviventes que ele derruba ──
const hoje = () => require('../../services/diaLocal').hojeLocalISO(); // Etapa 165: o dia de Brasilia (B1056)
test('[X01 P03,P18] rejeitada com motivo: PUT {status: rejeitada} sem motivo -> 200 e o motivo gravado fica', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'rejeitada', motivo_nao_venda = 'CARO', data_fechamento = '2026-01-02' WHERE id = ?", [id]);
  await soMudou(id, { status: 'rejeitada' }, {});
  assert.strictEqual((await linhaP(id)).motivo_nao_venda, 'CARO');
});
test('[X02 P04] PUT {status: rejeitada, motivo: "   "} -> 400', async () => {
  const id = await novaProposta();
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { status: 'rejeitada', motivo_nao_venda: '   ' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_MOTIVO]);
});
test('[X03 P05] aprovada com data: PUT {data_fechamento: null} -> a data vira hoje (nao nula)', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'aprovada', data_fechamento = '2026-01-02' WHERE id = ?", [id]);
  await soMudou(id, { data_fechamento: null }, { data_fechamento: ['2026-01-02', hoje()] });
});
test('[X04 P11] margem exatamente 5 numa enviada sem aprovacao -> 200', async () => {
  const id = await novaProposta();
  await run('UPDATE propostas SET margem_desconto = 5 WHERE id = ?', [id]);
  await soMudou(id, { status: 'enviada' }, { status: ['rascunho', 'enviada'] });
});
test('[X05 P14] responsavel de OUTRO usuario: PUT {titulo} pelo admin mantem o responsavel', async () => {
  const id = await novaProposta();
  const u = await run("INSERT INTO usuarios (nome, email, senha) VALUES ('Outro', ?, 'x')", [`outro${Date.now()}@t.com`]);
  await run('UPDATE propostas SET responsavel_id = ? WHERE id = ?', [u.lastID, id]);
  await soMudou(id, { titulo: 'Resp' }, { titulo: ['PROP', 'RESP'] });
  assert.strictEqual((await linhaP(id)).responsavel_id, u.lastID);
});
test('[X06 P33] responsavel nulo: PUT {titulo} -> responsavel vira quem salva (o de sempre)', async () => {
  const id = await novaProposta();
  const adm = (await get('SELECT id FROM usuarios WHERE email = ?', [SEED.email])).id;
  await run('UPDATE propostas SET responsavel_id = NULL WHERE id = ?', [id]);
  await soMudou(id, { titulo: 'Resp2' }, { titulo: ['PROP', 'RESP2'], responsavel_id: [null, adm] });
});
test('[X07 P16] rejeitada: PUT {motivo_nao_venda: "novo"} sozinho grava o motivo', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'rejeitada', motivo_nao_venda = 'CARO', data_fechamento = '2026-01-02' WHERE id = ?", [id]);
  await soMudou(id, { motivo_nao_venda: 'novo' }, { motivo_nao_venda: ['CARO', 'NOVO'] });
});
test('[X08 P17] enviada com motivo legado: PUT {titulo} nao apaga o motivo (ausente mantem)', async () => {
  const id = await novaProposta();
  await run("UPDATE propostas SET status = 'enviada', motivo_nao_venda = 'LEG' WHERE id = ?", [id]);
  await soMudou(id, { titulo: 'Leg' }, { titulo: ['PROP', 'LEG'] });
});
test('[X09a P20] projeto_id vazio grava null (a transformacao de sempre)', async () => {
  const id = await novaProposta();
  await soMudou(id, { projeto_id: '' }, { projeto_id: [ctx.projetoId, null] });
});
test('[X09b P19] cliente_id vazio grava null (a transformacao de sempre)', async () => {
  const id = await novaProposta();
  // sem cliente, o contato e o projeto da proposta (do cliente anterior) tambem saem (RN-13)
  await soMudou(id, { cliente_id: '' }, { cliente_id: [ctx.clienteId, null], cliente_contato: ['MARIA', null], cliente_telefone: ['1188', null],
    cliente_email: ['m@m.com', null], projeto_id: [ctx.projetoId, null] });
});
test('[X10 P23] PUT {valor_total: 0} grava 0 (nao null)', async () => {
  const id = await novaProposta();
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { valor_total: 0 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await linhaP(id)).valor_total, 0);
});
test('[X11 P24] PUT {margem_desconto: null} grava 0', async () => {
  const id = await novaProposta();
  await soMudou(id, { margem_desconto: null }, { margem_desconto: [2, 0] });
});
test('[X12 P25+mapa] toda coluna do mapa da proposta que nenhum teste escreve: presente grava', async () => {
  const id = await novaProposta();
  const c2 = await novoCliente();
  const [, pj] = await j('POST', '/projetos', ctx.T, { cliente_id: c2, nome: 'Proj X12' });
  const corpo = { cliente_id: c2, projeto_id: pj.id, validade: '2027-01-15', prazo_entrega: 'pz2', observacoes: 'obs2', familia_produto: 'FAM2',
    lembrete_data: '2027-02-02', lembrete_mensagem: 'msg2', cliente_telefone: '2199', cliente_email: 'n@n.com', idioma: 'en', moeda: 'USD',
    incoterm: 'CIF', unidade_negocio: 'UN2' };
  const r = await j('PUT', `/propostas/${id}`, ctx.T, corpo);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const d = await linhaP(id);
  const nao = Object.keys(corpo).filter((k) => String(d[k]).toUpperCase() !== String(corpo[k]).toUpperCase());
  assert.deepStrictEqual(nao, [], 'nao gravou: ' + nao.map((k) => `${k}=${JSON.stringify(d[k])}`).join(' '));
});
test('[X13 P26] PUT {itens: null} -> o de sempre (presente vazio): apaga os itens', async () => {
  const id = await novaProposta();
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { itens: null });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await itensP(id), []);
});
test('[X14 P29] PUT {itens mudados} sem valor_total: a revisao sobe e o registro NAO diz Valor Total', async () => {
  const id = await novaProposta();
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { itens: [{ ...ITENS[0], quantidade: 3 }, ITENS[1]] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await linhaP(id)).revisao, 1);
  const rev = await get('SELECT mudancas FROM proposta_revisoes WHERE proposta_id = ? ORDER BY id DESC LIMIT 1', [id]);
  assert.ok(rev, 'sem registro de revisao');
  assert.ok(!JSON.parse(rev.mudancas).some((m) => m.campo === 'Valor Total'), rev.mudancas);
});
test('[X15 P32] proposta sem cliente gravado: PUT {cliente_id, valor_total} -> REV01 no numero', async () => {
  const id = await novaProposta();
  await run('UPDATE propostas SET cliente_id = NULL WHERE id = ?', [id]);
  const a = await linhaP(id);
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { cliente_id: ctx.clienteId, valor_total: 999 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await linhaP(id)).numero_proposta, a.numero_proposta.replace(/REV00$/, 'REV01'));
});
test('[X16 C02,C08+mapa] cliente: toda coluna do mapa presente grava com a transformacao', async () => {
  const c = await novoCliente();
  const corpo = { nome_fantasia: 'fant2', cnpj: '99.888.777/0001-66', segmento: 'seg2', email: 'Novo@X.com', endereco: 'rua b', estado: 'rj', cep: '20000-000',
    contato_principal: 'ana', observacoes: 'obs2', status: 'inativo' };
  const r = await j('PUT', `/clientes/${c}`, ctx.T, corpo);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const d = await get('SELECT * FROM clientes WHERE id = ?', [c]);
  const up = ['nome_fantasia', 'segmento', 'endereco', 'estado', 'contato_principal', 'observacoes'];
  const nao = Object.keys(corpo).filter((k) => d[k] !== (up.includes(k) ? corpo[k].toUpperCase() : corpo[k]));
  assert.deepStrictEqual(nao, [], 'nao gravou: ' + nao.map((k) => `${k}=${JSON.stringify(d[k])}`).join(' '));
});
test('[X17 O03,O04+mapa] oportunidade: toda coluna do mapa presente grava', async () => {
  const [, op] = await j('POST', '/oportunidades', ctx.T, { cliente_id: ctx.clienteId, titulo: 'OpX', descricao: 'd', valor_estimado: 1000, probabilidade: 70, etapa: 'negociacao', status: 'ativa' });
  const c2 = await novoCliente();
  const [, pj] = await j('POST', '/projetos', ctx.T, { cliente_id: c2, nome: 'Proj X17' });
  const u = await run("INSERT INTO usuarios (nome, email, senha) VALUES ('Outro2', ?, 'x')", [`outro2${Date.now()}@t.com`]);
  const corpo = { cliente_id: c2, projeto_id: pj.id, descricao: 'D2', valor_estimado: 2500, probabilidade: 30, status: 'perdida', responsavel_id: u.lastID };
  const r = await j('PUT', `/oportunidades/${op.id}`, ctx.T, corpo);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const d = await get('SELECT * FROM oportunidades WHERE id = ?', [op.id]);
  const nao = Object.keys(corpo).filter((k) => d[k] !== corpo[k]);
  assert.deepStrictEqual(nao, [], 'nao gravou: ' + nao.map((k) => `${k}=${JSON.stringify(d[k])}`).join(' '));
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
