/**
 * Etapa 140 (propostas) — a autorização do desconto acima de 5 % (C301, C302, C303), pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-140.01 decidir exige ser aprovador (coluna pode_aprovar_descontos ou super)     RN-140.07 o pedido vai para outro aprovador
 *   RN-140.02 quem pediu não decide (nem o super)                                       RN-140.08 desconto_aprovado só pela aprovação
 *   RN-140.03 aprovado_por é quem está logado                                           RN-140.09 na desconto_aprovado, margem > 5 casa
 *   RN-140.04 só pedido pendente se decide (409)                                        RN-140.10 /enviar passa pela regra dos 5 %
 *   RN-140.05 aprovar: valor legível e proposta em rascunho/desconto aprovado           RN-140.11 a lista diz quem pode decidir
 *   RN-140.06 o pedido nasce pendente, em nome de quem pede
 *
 * Antes: qualquer vendedor liberava o próprio desconto por três caminhos — aprovando o próprio pedido (`PUT /aprovacoes/:id`), criando o
 * pedido já aprovado (`POST /aprovacoes {status: 'aprovado'}`) ou pondo a proposta em desconto_aprovado pelo PUT e enviando (o /enviar
 * não olhava a margem).
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa140-a-autorizacao-do-desconto.md
 * Molde: propostaMargemInvalida.api.test.js.
 * Executar: cd server && node tests/api/aprovacaoDescontoAutorizacao.api.test.js
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
const testesComAtraso = [];
function testComAtraso(name, fn) { testesComAtraso.push([name, fn]); }

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
const SEED = { email: 'e140super@t.com', senha: 'E140super!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000', ...extraEnv });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'),
    '-r', path.join(__dirname, '..', 'helpers', 'atrasoSqlInjetado.js'), 'index.js'], {
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
  SEM_PERMISSAO: 'Você não tem permissão para aprovar descontos. Peça a um usuário com "Pode aprovar descontos".',
  PROPRIO: 'Quem pediu a aprovação do desconto não pode decidi-la. Peça a outro aprovador.',
  JA_DECIDIDA: 'Esta solicitação de aprovação já foi decidida. Recarregue a lista.',
  VALOR_PEDIDO: 'O desconto desta solicitação não é um número de 0 a 100. Rejeite-a e peça uma nova.',
  PROPOSTA_SAIU: 'A proposta desta solicitação não está mais em rascunho nem com desconto aprovado. Rejeite a solicitação ou volte a proposta para rascunho.',
  PROPOSTA_404: 'Proposta não encontrada',
  PROPOSTA_ID: 'proposta_id é obrigatório',
  SO_VOCE: 'Só você pode aprovar descontos, e quem pede não decide o próprio pedido. Configure outro usuário com "Pode aprovar descontos" na gestão de usuários.',
  SEM_APROVADOR: 'Nenhum usuário configurado para aprovar descontos. Configure um usuário na gestão de usuários.',
  DA_SO_APROVACAO: 'O status "Desconto aprovado" só é dado pela aprovação do desconto, em Comercial → Aprovações. Se a proposta estava com desconto aprovado, ela mudou depois de aberta: recarregue-a.',
  DA_MARGEM: 'O desconto acima de 5% desta proposta não é o que foi aprovado. Para mudar o desconto, salve a proposta como rascunho e peça nova aprovação.',
  ASSINAR: 'Não é possível assinar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações.',
  ENVIAR: 'Não é possível enviar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações.',
  DESC_PUT: 'Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada.',
  CONFLITO: 'A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo.',
  MARGEM: 'Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal.',
  STATUS_INVALIDO: 'Status deve ser "aprovado" ou "rejeitado"',
};

const ctx = { n: 0, id: {}, tok: {} };
const linhaP = (id) => get('SELECT * FROM propostas WHERE id = ?', [id]);
const linhaA = (id) => get('SELECT * FROM aprovacoes WHERE id = ?', [id]);
const contaA = async () => (await get('SELECT COUNT(*) n FROM aprovacoes')).n;
function mudou(antes, depois, ignorar = ['updated_at', 'html_rendered']) {
  const out = {};
  for (const k of Object.keys(antes)) if (!ignorar.includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) out[k] = [antes[k], depois[k]];
  return out;
}
const ITENS = [{ descricao: 'Item 1', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000, codigo_produto: 'P1' }];
async function novaProposta(quem, extra = {}) {
  const [s, p] = await j('POST', '/propostas', ctx.tok[quem], { cliente_id: ctx.clienteId, titulo: `Prop ${++ctx.n}`, valor_total: 1000, status: 'rascunho', itens: ITENS, ...extra });
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
async function pedir(quem, propostaId, valor, extra = {}) {
  const [s, x] = await j('POST', '/aprovacoes', ctx.tok[quem], {
    proposta_id: propostaId, tipo: 'desconto', valor_desconto: valor, valor_total: 1000, valor_com_desconto: 1000 - 10 * valor,
    valor_desconto_rs: 10 * valor, solicitado_por: ctx.id[quem], status: 'pendente', ...extra,
  });
  assert.strictEqual(s, 200, `pedir: ${s} ${JSON.stringify(x)}`);
  return x.id;
}
const decidir = (quem, aprovId, corpo) => j('PUT', `/aprovacoes/${aprovId}`, ctx.tok[quem], corpo);
const aprovar = (quem, aprovId) => decidir(quem, aprovId, { status: 'aprovado' });
const rejeitar = (quem, aprovId) => decidir(quem, aprovId, { status: 'rejeitado', motivo_rejeicao: 'nao' });
/** Proposta rascunho com margem m e um pedido pendente de quem a criou. */
async function propostaComPedido(quem, m) {
  const pid = await novaProposta(quem, { margem_desconto: m });
  const aid = await pedir(quem, pid, m);
  return { pid, aid };
}
/** A recusa: status e mensagem literais, e nada mudou na aprovação nem na proposta. */
async function recusaDecisao(quem, aid, corpo, status, msg) {
  const a = await linhaA(aid);
  const p = await linhaP(a.proposta_id);
  const r = await decidir(quem, aid, corpo);
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [status, msg], `${quem} ${JSON.stringify(corpo)}`);
  assert.deepStrictEqual(mudou(a, await linhaA(aid), []), {}, 'a recusa mudou a aprovacao');
  if (p) assert.deepStrictEqual(mudou(p, await linhaP(a.proposta_id)), {}, 'a recusa mudou a proposta');
  else assert.strictEqual(await linhaP(a.proposta_id), undefined, 'a recusa criou a proposta');
}
async function recusaPut(quem, id, corpo, status, msg) {
  const a = await linhaP(id);
  const r = await j('PUT', `/propostas/${id}`, ctx.tok[quem], corpo);
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [status, msg], `PUT ${JSON.stringify(corpo)}`);
  assert.deepStrictEqual(mudou(a, await linhaP(id)), {}, `a recusa de ${JSON.stringify(corpo)} gravou algo`);
}
async function recusaEnviar(quem, id, status, msg) {
  const a = await linhaP(id);
  const r = await j('POST', `/propostas/${id}/enviar`, ctx.tok[quem]);
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [status, msg], 'enviar');
  assert.deepStrictEqual(mudou(a, await linhaP(id)), {}, 'a recusa do envio gravou algo');
}
/** Aprovada por aprov2: a proposta fica desconto_aprovado com a margem m. */
async function propostaAprovada(quem, m) {
  const { pid, aid } = await propostaComPedido(quem, m);
  const r = await aprovar(quem === 'aprov2' ? 'aprov1' : 'aprov2', aid);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const p = await linhaP(pid);
  assert.deepStrictEqual([p.status, p.margem_desconto], ['desconto_aprovado', m]);
  return { pid, aid };
}

// ── RN-140.01 / 02 / 03: quem decide ─────────────────────────────────────────────────────
test('[RN-140.01] o vendedor sem a permissao nao aprova nem rejeita o proprio pedido (antes: 200 e a proposta virava desconto aprovado)', async () => {
  const { aid } = await propostaComPedido('vend', 30);
  await recusaDecisao('vend', aid, { status: 'aprovado' }, 403, L.SEM_PERMISSAO);
  await recusaDecisao('vend', aid, { status: 'rejeitado', motivo_rejeicao: 'x' }, 403, L.SEM_PERMISSAO);
  // e nem o pedido de outra pessoa
  const { aid: aid2 } = await propostaComPedido('aprov1', 20);
  await recusaDecisao('vend', aid2, { status: 'aprovado' }, 403, L.SEM_PERMISSAO);
});

test('[RN-140.01] o administrador de papel sem a coluna e sem super nao decide; o super sem a coluna decide', async () => {
  const { pid, aid } = await propostaComPedido('vend', 12);
  await recusaDecisao('adm', aid, { status: 'aprovado' }, 403, L.SEM_PERMISSAO);
  const r = await aprovar('super', aid);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const a = await linhaA(aid);
  assert.deepStrictEqual([a.status, a.aprovado_por], ['aprovado', ctx.id.super]);
  assert.strictEqual((await linhaP(pid)).status, 'desconto_aprovado');
});

test('[RN-140.02] quem pediu nao decide — nem com a permissao, nem o super; outro aprovador decide', async () => {
  const { aid } = await propostaComPedido('aprov1', 20);
  await recusaDecisao('aprov1', aid, { status: 'aprovado' }, 403, L.PROPRIO);
  await recusaDecisao('aprov1', aid, { status: 'rejeitado', motivo_rejeicao: 'x' }, 403, L.PROPRIO);
  const { aid: aidS } = await propostaComPedido('super', 25);
  await recusaDecisao('super', aidS, { status: 'aprovado' }, 403, L.PROPRIO);
  const r = await aprovar('aprov2', aid);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
});

test('[RN-140.02] a ordem das recusas: status invalido e motivo antes do 404; 404 antes da permissao', async () => {
  let r = await decidir('vend', 999999, { status: 'x' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L.STATUS_INVALIDO]);
  r = await decidir('vend', 999999, { status: 'rejeitado' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, 'Motivo da rejeição é obrigatório']);
  r = await decidir('vend', 999999, { status: 'aprovado' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [404, 'Aprovação não encontrada']);
});

test('[RN-140.03] o aprovado_por do corpo e ignorado: grava quem esta logado', async () => {
  const { aid } = await propostaComPedido('vend', 15);
  const r = await decidir('aprov1', aid, { status: 'aprovado', aprovado_por: ctx.id.vend });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await linhaA(aid)).aprovado_por, ctx.id.aprov1);
  const { aid: aid2 } = await propostaComPedido('vend', 15);
  const r2 = await decidir('aprov1', aid2, { status: 'rejeitado', motivo_rejeicao: 'caro', aprovado_por: ctx.id.aprov2 });
  assert.strictEqual(r2[0], 200, JSON.stringify(r2[1]));
  assert.strictEqual((await linhaA(aid2)).aprovado_por, ctx.id.aprov1);
});

// ── RN-140.04 / 05: o que se decide ──────────────────────────────────────────────────────
test('[RN-140.04] pedido ja decidido nao se decide de novo (aprovar o rejeitado, rejeitar o aprovado) -> 409', async () => {
  const { aid } = await propostaComPedido('vend', 18);
  assert.strictEqual((await rejeitar('aprov1', aid))[0], 200);
  await recusaDecisao('aprov2', aid, { status: 'aprovado' }, 409, L.JA_DECIDIDA);
  const { aid: aid2 } = await propostaComPedido('vend', 18);
  assert.strictEqual((await aprovar('aprov1', aid2))[0], 200);
  await recusaDecisao('aprov2', aid2, { status: 'rejeitado', motivo_rejeicao: 'x' }, 409, L.JA_DECIDIDA);
  await recusaDecisao('aprov1', aid2, { status: 'aprovado' }, 409, L.JA_DECIDIDA);
});

test('[RN-140.04] duas decisoes ao mesmo tempo: uma passa, a outra 409, e a proposta segue a que passou', async () => {
  for (let k = 0; k < 6; k++) {
    const { pid, aid } = await propostaComPedido('vend', 22);
    const rs = await Promise.all([aprovar('aprov1', aid), rejeitar('aprov2', aid)]);
    const st = rs.map((r) => r[0]).sort();
    assert.deepStrictEqual(st, [200, 409], `rodada ${k}: ${JSON.stringify(rs)}`);
    const a = await linhaA(aid);
    const p = await linhaP(pid);
    assert.strictEqual(p.status, a.status === 'aprovado' ? 'desconto_aprovado' : 'rascunho', `rodada ${k}: ${a.status} x ${p.status}`);
  }
});

test('[RN-140.05] aprovar um pedido com valor fora da regua (A86) -> 400; rejeitar passa', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 2 });
  const ins = await run("INSERT INTO aprovacoes (proposta_id, tipo, valor_desconto, solicitado_por, status) VALUES (?, 'desconto', '10,5', ?, 'pendente')", [pid, ctx.id.vend]);
  await recusaDecisao('aprov1', ins.lastID, { status: 'aprovado' }, 400, L.VALOR_PEDIDO);
  const r = await rejeitar('aprov1', ins.lastID);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await linhaP(pid)).margem_desconto, 2);
});

test('[RN-140.05] aprovar pedido de proposta ja enviada/aprovada/rejeitada -> 409 e a proposta fica (antes: rebaixava)', async () => {
  for (const st of ['enviada', 'visualizada', 'aprovada', 'rejeitada']) {
    const { pid, aid } = await propostaComPedido('vend', 20);
    await run('UPDATE propostas SET status = ?, margem_desconto = 3 WHERE id = ?', [st, pid]);
    await recusaDecisao('aprov1', aid, { status: 'aprovado' }, 409, L.PROPOSTA_SAIU);
    const r = await rejeitar('aprov1', aid);
    assert.strictEqual(r[0], 200, `${st}: ${JSON.stringify(r[1])}`);
    assert.deepStrictEqual([(await linhaP(pid)).status, (await linhaP(pid)).margem_desconto], [st, 3]);
  }
});

test('[RN-140.05] aprovar atualiza a proposta ANTES da resposta e registra o historico de status', async () => {
  const { pid, aid } = await propostaComPedido('vend', 33);
  const r = await aprovar('aprov1', aid);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(r[1], { message: 'Aprovação aprovada com sucesso', id: aid, status: 'aprovado' });
  const p = await linhaP(pid); // lido logo depois da resposta, sem esperar
  assert.deepStrictEqual([p.status, p.margem_desconto], ['desconto_aprovado', 33]);
  const h = await get("SELECT * FROM proposta_status_history WHERE proposta_id = ? AND status_novo = 'desconto_aprovado'", [pid]);
  assert.ok(h, 'sem historico');
  assert.deepStrictEqual([h.status_anterior, h.usuario_id], ['rascunho', ctx.id.aprov1]);
  // aprovar um segundo pedido numa proposta ja com desconto aprovado: troca a margem, fica no status
  const aid2 = await pedir('vend', pid, 40);
  assert.strictEqual((await aprovar('aprov2', aid2))[0], 200);
  assert.deepStrictEqual([(await linhaP(pid)).status, (await linhaP(pid)).margem_desconto], ['desconto_aprovado', 40]);
});

// ── RN-140.06 / 07: o pedido ─────────────────────────────────────────────────────────────
test('[RN-140.06] o pedido nasce pendente e em nome de quem pede, qualquer que seja o corpo (antes: nascia aprovado, em nome de outro)', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 30 });
  const aid = await pedir('vend', pid, 30, { status: 'aprovado', solicitado_por: ctx.id.aprov1, aprovado_por: ctx.id.aprov1 });
  const a = await linhaA(aid);
  assert.deepStrictEqual([a.status, a.solicitado_por, a.aprovado_por], ['pendente', ctx.id.vend, null]);
  // sem solicitado_por no corpo tambem cria (o corpo nao manda mais em quem pede)
  const [s, x] = await j('POST', '/aprovacoes', ctx.tok.vend, { proposta_id: pid, tipo: 'desconto', valor_desconto: 30 });
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.strictEqual((await linhaA(x.id)).solicitado_por, ctx.id.vend);
  // e a proposta continua em rascunho
  assert.strictEqual((await linhaP(pid)).status, 'rascunho');
});

test('[RN-140.06] sem proposta_id -> 400; proposta inexistente -> 404 (antes 500 de chave estrangeira); a ordem: id, valor, 404', async () => {
  const n = await contaA();
  let r = await j('POST', '/aprovacoes', ctx.tok.vend, { tipo: 'desconto', valor_desconto: 'x' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L.PROPOSTA_ID]);
  r = await j('POST', '/aprovacoes', ctx.tok.vend, { proposta_id: 999999, tipo: 'desconto', valor_desconto: '10,5' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L.MARGEM]);
  r = await j('POST', '/aprovacoes', ctx.tok.vend, { proposta_id: 999999, tipo: 'desconto', valor_desconto: 10 });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [404, L.PROPOSTA_404]);
  assert.strictEqual(await contaA(), n, 'a recusa criou pedido');
});

test('[RN-140.07] a atividade vai para outro aprovador; sem valores no corpo nao derruba nada', async () => {
  const pid = await novaProposta('aprov1', { margem_desconto: 20 });
  const [s, x] = await j('POST', '/aprovacoes', ctx.tok.aprov1, { proposta_id: pid, tipo: 'desconto', valor_desconto: 20 });
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.notStrictEqual(x.aprovador_id, ctx.id.aprov1);
  assert.strictEqual(x.aprovador_id, ctx.id.aprov2);
  let at = null;
  for (let k = 0; k < 40 && !at; k++) { // a atividade e gravada depois da resposta
    at = await get("SELECT * FROM atividades WHERE tipo = 'aprovacao_desconto' AND created_by = ? ORDER BY id DESC", [ctx.id.aprov1]);
    if (!at) await pausa(100);
  }
  assert.ok(at, 'a atividade nao foi criada (a descricao com valor_total ausente quebrava)');
  assert.strictEqual(at.responsavel_id, ctx.id.aprov2);
  // o do vendedor vai para o primeiro aprovador com a coluna
  const pid2 = await novaProposta('vend', { margem_desconto: 20 });
  const [s2, x2] = await j('POST', '/aprovacoes', ctx.tok.vend, { proposta_id: pid2, tipo: 'desconto', valor_desconto: 20 });
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  assert.strictEqual(x2.aprovador_id, ctx.id.aprov1);
  assert.strictEqual(saiu, null, 'o servidor caiu');
});

test('[RN-140.07] so quem pede e aprovador -> 400 L-SO-VOCE; ninguem aprova -> 400 L-SEM-APROVADOR; nada criado', async () => {
  const pid = await novaProposta('aprov1', { margem_desconto: 20 });
  const salvo = await all('SELECT id, pode_aprovar_descontos p, is_superadmin s FROM usuarios');
  try {
    await run('UPDATE usuarios SET pode_aprovar_descontos = 0, is_superadmin = 0 WHERE id != ?', [ctx.id.aprov1]);
    const n = await contaA();
    let r = await j('POST', '/aprovacoes', ctx.tok.aprov1, { proposta_id: pid, tipo: 'desconto', valor_desconto: 20 });
    assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L.SO_VOCE]);
    await run('UPDATE usuarios SET pode_aprovar_descontos = 0 WHERE id = ?', [ctx.id.aprov1]);
    r = await j('POST', '/aprovacoes', ctx.tok.aprov1, { proposta_id: pid, tipo: 'desconto', valor_desconto: 20 });
    assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L.SEM_APROVADOR]);
    assert.strictEqual(await contaA(), n, 'a recusa criou pedido');
  } finally {
    for (const u of salvo) await run('UPDATE usuarios SET pode_aprovar_descontos = ?, is_superadmin = ? WHERE id = ?', [u.p, u.s, u.id]);
  }
});

// ── RN-140.08 / 09: o PUT da proposta ────────────────────────────────────────────────────
test('[RN-140.08] o PUT nao poe desconto_aprovado por conta propria — com qualquer margem e de qualquer status (antes: 200)', async () => {
  for (const m of [50, 3, 0]) {
    const id = await novaProposta('vend', { margem_desconto: m });
    await recusaPut('vend', id, { status: 'desconto_aprovado', margem_desconto: m }, 403, L.DA_SO_APROVACAO);
    await recusaPut('vend', id, { status: 'desconto_aprovado' }, 403, L.DA_SO_APROVACAO);
  }
  const id = await novaProposta('vend', { margem_desconto: 3 });
  await run("UPDATE propostas SET status = 'enviada' WHERE id = ?", [id]);
  await recusaPut('vend', id, { status: 'desconto_aprovado' }, 403, L.DA_SO_APROVACAO);
  // nem o aprovador, nem o super, pelo PUT
  const id2 = await novaProposta('vend', { margem_desconto: 30 });
  await recusaPut('super', id2, { status: 'desconto_aprovado' }, 403, L.DA_SO_APROVACAO);
  await recusaPut('aprov1', id2, { status: 'desconto_aprovado' }, 403, L.DA_SO_APROVACAO);
});

test('[RN-140.08] a ordem: titulo e margem invalida antes; e a proposta ja em desconto_aprovado manda o mesmo status e passa', async () => {
  const id = await novaProposta('vend', { margem_desconto: 3 });
  await recusaPut('vend', id, { status: 'desconto_aprovado', titulo: '' }, 400, 'Título é obrigatório');
  await recusaPut('vend', id, { status: 'desconto_aprovado', margem_desconto: 'x' }, 400, L.MARGEM);
  const { pid } = await propostaAprovada('vend', 12);
  const r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { status: 'desconto_aprovado', titulo: 'Mesmo status' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual([(await linhaP(pid)).status, (await linhaP(pid)).titulo], ['desconto_aprovado', 'MESMO STATUS']);
});

test('[RN-140.09] numa desconto_aprovado, trocar a margem acima de 5 para o que nao foi aprovado -> 403 (antes 200 e enviava 50%)', async () => {
  const { pid } = await propostaAprovada('vend', 10);
  await recusaPut('vend', pid, { margem_desconto: 50 }, 403, L.DA_MARGEM);
  await recusaPut('vend', pid, { margem_desconto: 50, status: 'desconto_aprovado' }, 403, L.DA_MARGEM);
  await recusaPut('vend', pid, { margem_desconto: 10.02 }, 403, L.DA_MARGEM);
  let r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 10 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 3 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 10, status: 'desconto_aprovado' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  // voltar para rascunho com outra margem e pedir de novo continua possivel
  r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 50, status: 'rascunho' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
});

test('[RN-140.09] numa desconto_aprovado, a margem gravada ilegivel conta como acima de 5', async () => {
  const { pid } = await propostaAprovada('vend', 10);
  await run("UPDATE propostas SET margem_desconto = '10,5' WHERE id = ?", [pid]);
  await recusaPut('vend', pid, { status: 'desconto_aprovado' }, 403, L.DA_MARGEM);
  const r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { titulo: 'So titulo' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
});

// ── RN-140.10: o envio ───────────────────────────────────────────────────────────────────
test('[RN-140.10] /enviar com margem acima de 5 sem aprovacao que case -> 403 (antes: enviava)', async () => {
  const id = await novaProposta('vend', { margem_desconto: 30 });
  await recusaEnviar('vend', id, 403, L.ENVIAR);
  // pedido pendente ou rejeitado nao vale
  const aid = await pedir('vend', id, 30);
  await recusaEnviar('vend', id, 403, L.ENVIAR);
  assert.strictEqual((await rejeitar('aprov1', aid))[0], 200);
  await recusaEnviar('vend', id, 403, L.ENVIAR);
  // aprovacao de outro valor nao vale
  const aid2 = await pedir('vend', id, 20);
  assert.strictEqual((await aprovar('aprov1', aid2))[0], 200);
  await run("UPDATE propostas SET status = 'rascunho', margem_desconto = 30 WHERE id = ?", [id]);
  await recusaEnviar('vend', id, 403, L.ENVIAR);
  // margem gravada ilegivel conta como acima de 5
  const id3 = await novaProposta('vend', { margem_desconto: 2 });
  await run("UPDATE propostas SET margem_desconto = '10,5' WHERE id = ?", [id3]);
  await recusaEnviar('vend', id3, 403, L.ENVIAR);
});

test('[RN-140.10] /enviar com margem ate 5, ou com a aprovacao que casa, envia como hoje; a ordem 404 -> status -> desconto', async () => {
  const id = await novaProposta('vend', { margem_desconto: 5 });
  let r = await j('POST', `/propostas/${id}/enviar`, ctx.tok.vend);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await linhaP(id)).status, 'enviada');
  const { pid } = await propostaAprovada('vend', 25);
  r = await j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const p = await linhaP(pid);
  assert.deepStrictEqual([p.status, p.margem_desconto, !!p.enviada_em], ['enviada', 25, true]);
  // nova revisao volta a rascunho: a aprovacao da mesma margem continua valendo
  r = await j('POST', `/propostas/${pid}/nova-revisao`, ctx.tok.vend);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  r = await j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  // a ordem
  r = await j('POST', '/propostas/999999/enviar', ctx.tok.vend);
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [404, 'Proposta não encontrada']);
  const id4 = await novaProposta('vend', { margem_desconto: 30 });
  await run("UPDATE propostas SET status = 'aprovada' WHERE id = ?", [id4]);
  await recusaEnviar('vend', id4, 400, 'Só é possível enviar proposta em rascunho ou com desconto aprovado');
});

test('[RN-140.10] /enviar x troca de margem ao mesmo tempo: nunca fica enviada com desconto acima de 5 sem aprovacao', async () => {
  const furos = []; let conflitos = 0;
  for (let k = 0; k < 8; k++) {
    const id = await novaProposta('vend', { margem_desconto: 3 });
    const rs = await Promise.all([
      j('POST', `/propostas/${id}/enviar`, ctx.tok.vend),
      j('PUT', `/propostas/${id}`, ctx.tok.vend, { margem_desconto: 30 }),
    ]);
    for (const r of rs) {
      const ok = r[0] === 200 || (r[0] === 403 && [L.ENVIAR, L.DESC_PUT].includes(r[1].error)) || (r[0] === 409 && r[1].error === L.CONFLITO);
      assert.ok(ok, `rodada ${k}: ${JSON.stringify(rs)}`);
    }
    if (rs[0][0] === 409) { conflitos++; assert.strictEqual(rs[0][1].code, 'PROPOSTA_ALTERADA'); }
    const p = await linhaP(id);
    if (p.status === 'enviada' && Number(p.margem_desconto) > 5) furos.push(k);
  }
  assert.deepStrictEqual(furos, [], `enviada com desconto acima de 5 sem aprovacao (conflitos ${conflitos})`);
});

test('[RN-140.10] /enviar com a aprovacao de 30 x PUT da margem 50 ao mesmo tempo: nunca sai enviada com 50 (a guarda do envio)', async () => {
  const furos = []; const vistos = {};
  for (let k = 0; k < 12; k++) {
    const { pid } = await propostaAprovada('vend', 30);
    const r0 = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { status: 'rascunho' });
    assert.strictEqual(r0[0], 200, JSON.stringify(r0[1]));
    const put = j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 50 });
    await pausa(k % 4); // espalha o instante do envio em relacao ao PUT
    const env = j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
    const rs = await Promise.all([put, env]);
    const chave = rs.map((r) => r[0]).join('/');
    vistos[chave] = (vistos[chave] || 0) + 1;
    const p = await linhaP(pid);
    if (p.status === 'enviada' && Number(p.margem_desconto) !== 30) furos.push([k, chave, p.margem_desconto]);
  }
  assert.deepStrictEqual(furos, [], `enviada com a margem que nao foi aprovada (${JSON.stringify(vistos)})`);
});

// ── RN-140.11: a lista ───────────────────────────────────────────────────────────────────
test('[RN-140.11] GET /aprovacoes: pode_decidir so para aprovador, em pedido pendente de outra pessoa; recebidas sem os proprios', async () => {
  const { aid: doVend } = await propostaComPedido('vend', 14);
  const { aid: doAprov1 } = await propostaComPedido('aprov1', 14);
  const { aid: decidido } = await propostaComPedido('vend', 14);
  assert.strictEqual((await rejeitar('aprov2', decidido))[0], 200);
  const mapa = async (quem, q = '') => {
    const [s, rows] = await j('GET', `/aprovacoes${q}`, ctx.tok[quem]);
    assert.strictEqual(s, 200, JSON.stringify(rows));
    return Object.fromEntries(rows.filter((r) => [doVend, doAprov1, decidido].includes(r.id)).map((r) => [r.id, r.pode_decidir]));
  };
  assert.deepStrictEqual(await mapa('aprov1'), { [doVend]: true, [doAprov1]: false, [decidido]: false });
  assert.deepStrictEqual(await mapa('vend'), { [doVend]: false, [doAprov1]: false, [decidido]: false });
  assert.deepStrictEqual(await mapa('super'), { [doVend]: true, [doAprov1]: true, [decidido]: false });
  assert.deepStrictEqual(await mapa('adm'), { [doVend]: false, [doAprov1]: false, [decidido]: false });
  const rec1 = await mapa('aprov1', '?tipo=recebida');
  assert.ok(doVend in rec1 && !(doAprov1 in rec1), `recebidas do aprov1: ${JSON.stringify(rec1)}`);
  const recS = await mapa('super', '?tipo=recebida');
  assert.ok(doVend in recS && doAprov1 in recS, `recebidas do super: ${JSON.stringify(recS)}`);
  assert.deepStrictEqual(await mapa('vend', '?tipo=recebida'), {});
});

// ── Fase 2 ───────────────────────────────────────────────────────────────────────────────
test('[RN-140.02] Fase 2 I5: o responsavel da proposta nao decide o pedido que um colega abriu; nem aparece como recebida', async () => {
  const pid = await novaProposta('aprov1', { margem_desconto: 30 });
  assert.strictEqual((await linhaP(pid)).responsavel_id, ctx.id.aprov1);
  const aid = await pedir('vend', pid, 30); // o colega abre o pedido da proposta do aprovador
  assert.strictEqual((await linhaA(aid)).solicitado_por, ctx.id.vend);
  await recusaDecisao('aprov1', aid, { status: 'aprovado' }, 403, L.PROPRIO);
  const [, lista] = await j('GET', '/aprovacoes', ctx.tok.aprov1);
  assert.strictEqual(lista.find((r) => r.id === aid).pode_decidir, false);
  const [, rec] = await j('GET', '/aprovacoes?tipo=recebida', ctx.tok.aprov1);
  assert.ok(!rec.some((r) => r.id === aid), 'o pedido da propria proposta aparece como recebida');
  assert.strictEqual((await aprovar('aprov2', aid))[0], 200);
});

test('[RN-140.05] Fase 2 I4: aprovacao x envio ao mesmo tempo — aprovado sempre com a margem aplicada; senao o pedido volta a pendente', async () => {
  const quebras = [];
  for (let k = 0; k < 8; k++) {
    const pid = await novaProposta('vend', { margem_desconto: 3 });
    const aid = await pedir('vend', pid, 20);
    const rs = await Promise.all([aprovar('aprov1', aid), j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend)]);
    const a = await linhaA(aid); const p = await linhaP(pid);
    if (rs[0][0] === 409) assert.strictEqual(rs[0][1].error, L.PROPOSTA_SAIU, `rodada ${k}`);
    // aprovado => a margem do pedido foi aplicada; nao aprovado => pendente (desfeito) e a proposta com a dela
    if (a.status === 'aprovado' && Number(p.margem_desconto) !== 20) quebras.push([k, 'aprovado sem a margem', p.status, p.margem_desconto]);
    if (a.status !== 'aprovado' && a.status !== 'pendente') quebras.push([k, a.status]);
    if (a.status === 'pendente' && (a.aprovado_por != null || a.aprovado_em != null)) quebras.push([k, 'pendente com decisor']);
    if (rs[0][0] === 200 && a.status !== 'aprovado') quebras.push([k, '200 sem aprovado']);
  }
  assert.deepStrictEqual(quebras, []);
});

test('[RN-140.05] proposta do pedido inexistente -> 404 ao aprovar; pedido de outro tipo so muda o pedido', async () => {
  const ins = await run("INSERT INTO aprovacoes (proposta_id, tipo, valor_desconto, solicitado_por, status) VALUES (987654, 'desconto', 10, ?, 'pendente')", [ctx.id.vend]);
  await recusaDecisao('aprov1', ins.lastID, { status: 'aprovado' }, 404, L.PROPOSTA_404);
  const pid = await novaProposta('vend', { margem_desconto: 2 });
  await run("UPDATE propostas SET status = 'enviada' WHERE id = ?", [pid]);
  const ins2 = await run("INSERT INTO aprovacoes (proposta_id, tipo, valor_desconto, solicitado_por, status) VALUES (?, 'prazo', '10,5', ?, 'pendente')", [pid, ctx.id.vend]);
  const r = await aprovar('aprov1', ins2.lastID);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual([(await linhaP(pid)).status, (await linhaP(pid)).margem_desconto], ['enviada', 2]);
});

test('[RN-140.02] quem nao pode decidir e rejeita sem motivo recebe o 400 do motivo (a ordem escrita)', async () => {
  const { aid } = await propostaComPedido('vend', 11);
  await recusaDecisao('vend', aid, { status: 'rejeitado' }, 400, 'Motivo da rejeição é obrigatório');
});

test('[RN-140.09] a aprovacao apagada pelo administrador: salvar sem mexer e enviar passam a recusar; rascunho sai', async () => {
  const { pid, aid } = await propostaAprovada('vend', 16);
  const [sd] = await j('DELETE', `/aprovacoes/${aid}`, ctx.tok.adm);
  assert.strictEqual(sd, 200);
  await recusaPut('vend', pid, { status: 'desconto_aprovado', margem_desconto: 16 }, 403, L.DA_MARGEM);
  await recusaEnviar('vend', pid, 403, L.ENVIAR);
  const r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { status: 'rascunho', margem_desconto: 16 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
});

test('[RN-140.13] Fase 2 I1: /assinar com margem acima de 5 sem aprovacao -> 403, nada gravado; com aprovacao ou ate 5 -> como hoje', async () => {
  const conta = async (pid) => (await get('SELECT COUNT(*) n FROM assinaturas_digitais WHERE proposta_id = ?', [pid])).n;
  const pid = await novaProposta('vend', { margem_desconto: 50 });
  const a = await linhaP(pid);
  let r = await j('POST', `/propostas/${pid}/assinar`, ctx.tok.vend, {});
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [403, L.ASSINAR]);
  assert.deepStrictEqual(mudou(a, await linhaP(pid)), {});
  assert.strictEqual(await conta(pid), 0);
  r = await j('POST', '/propostas/999999/assinar', ctx.tok.vend, {});
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [404, L.PROPOSTA_404]);
  const pid2 = await novaProposta('vend', { margem_desconto: 4 });
  r = await j('POST', `/propostas/${pid2}/assinar`, ctx.tok.vend, {});
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  const { pid: pid3 } = await propostaAprovada('vend', 12);
  r = await j('POST', `/propostas/${pid3}/assinar`, ctx.tok.vend, {});
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual(await conta(pid3), 1);
});

// ── T3: o fluxo inteiro, pela rota ───────────────────────────────────────────────────────
test('[integracao] vendedor pede, nao se libera por nenhum dos tres caminhos; o aprovador aprova; o formulario salva sem mexer; envia', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 30 });
  const aid = await pedir('vend', pid, 30, { status: 'aprovado', solicitado_por: ctx.id.aprov1 });
  assert.deepStrictEqual([(await linhaA(aid)).status, (await linhaA(aid)).solicitado_por], ['pendente', ctx.id.vend]);
  await recusaDecisao('vend', aid, { status: 'aprovado' }, 403, L.SEM_PERMISSAO);
  await recusaPut('vend', pid, { status: 'desconto_aprovado', margem_desconto: 30 }, 403, L.DA_SO_APROVACAO);
  await recusaEnviar('vend', pid, 403, L.ENVIAR);
  const [, lista] = await j('GET', '/aprovacoes', ctx.tok.aprov1);
  assert.strictEqual(lista.find((r) => r.id === aid).pode_decidir, true);
  assert.strictEqual((await aprovar('aprov1', aid))[0], 200);
  // o formulario reaberto e salvo sem mexer manda status e margem lidos (montarPayloadProposta) — tem de passar
  const [, lida] = await j('GET', `/propostas/${pid}`, ctx.tok.vend);
  const corpoForm = {
    titulo: lida.titulo, cliente_id: lida.cliente_id, status: lida.status, margem_desconto: Number(lida.margem_desconto) || 0,
    valor_total: 1000, itens: ITENS, motivo_nao_venda: null, data_fechamento: null,
  };
  let r = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, corpoForm);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  await recusaPut('vend', pid, { ...corpoForm, margem_desconto: 40 }, 403, L.DA_MARGEM);
  r = await j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual([(await linhaP(pid)).status, (await linhaP(pid)).margem_desconto], ['enviada', 30]);
  await recusaDecisao('aprov2', aid, { status: 'rejeitado', motivo_rejeicao: 'tarde' }, 409, L.JA_DECIDIDA);
});

// ── com a janela aberta (atrasoSqlInjetado): as corridas que as guardas fecham, de forma deterministica ─────────────────────
// O envio confere a aprovacao com a consulta de aprovacaoDesconto.margemLiberada; a aprovacao grava o pedido com este UPDATE.
const ATRASO = {
  ATRASO_SQL_INJETADO: String.raw`^SELECT id, valor_desconto FROM aprovacoes WHERE proposta_id = \? AND status = 'aprovado' AND tipo = 'desconto'$|^UPDATE aprovacoes SET status = \?, aprovado_por = \?, aprovado_em`,
  ATRASO_SQL_MS: '600',
};

testComAtraso('[RN-140.10] janela aberta: o PUT troca a margem enquanto o envio confere a aprovacao -> 409 e a proposta nao sai enviada', async () => {
  const { pid } = await propostaAprovada('vend', 30);
  assert.strictEqual((await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { status: 'rascunho' }))[0], 200);
  const env = j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
  await pausa(150); // o envio ja leu a margem 30 e esta conferindo a aprovacao
  const put = await j('PUT', `/propostas/${pid}`, ctx.tok.vend, { margem_desconto: 50 });
  assert.strictEqual(put[0], 200, JSON.stringify(put[1]));
  const r = await env;
  assert.deepStrictEqual([r[0], r[1] && r[1].error, r[1] && r[1].code], [409, L.CONFLITO, 'PROPOSTA_ALTERADA']);
  const p = await linhaP(pid);
  assert.deepStrictEqual([p.status, p.margem_desconto], ['rascunho', 50]);
});

testComAtraso('[RN-140.05] janela aberta: a proposta e enviada entre o pedido gravado e a proposta -> o pedido volta a pendente e 409', async () => {
  const pid = await novaProposta('vend', { margem_desconto: 3 });
  const aid = await pedir('vend', pid, 20);
  const ap = aprovar('aprov1', aid);
  await pausa(150); // o pedido ja foi gravado como aprovado; a proposta ainda nao
  const env = await j('POST', `/propostas/${pid}/enviar`, ctx.tok.vend);
  assert.strictEqual(env[0], 200, JSON.stringify(env[1]));
  const r = await ap;
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [409, L.PROPOSTA_SAIU]);
  const a = await linhaA(aid); const p = await linhaP(pid);
  assert.deepStrictEqual([a.status, a.aprovado_por, a.aprovado_em], ['pendente', null, null]);
  assert.deepStrictEqual([p.status, p.margem_desconto], ['enviada', 3]);
});

(async () => {
  console.log('\n=== Etapa 140 (propostas): a autorizacao do desconto acima de 5% (C301, C302, C303) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e140-aprov-'));
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 15000);
    const [, eu] = await j('GET', '/auth/me', ctx.T);
    ctx.id.super = (eu && (eu.id || (eu.user && eu.user.id))) || (await get('SELECT id FROM usuarios WHERE email = ?', [SEED.email])).id;
    ctx.tok.super = ctx.T;
    // vend sem a coluna · aprov1 e aprov2 com a coluna · adm papel admin sem a coluna e sem super · o super do seed sem a coluna
    const quem = { aprov1: { pode_aprovar_descontos: 1 }, aprov2: { pode_aprovar_descontos: 1 }, vend: {}, adm: { role: 'admin' } };
    for (const [k, extra] of Object.entries(quem)) {
      const email = `${k}140@t.com`;
      const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: k, email, senha: 'Senha!140', cargo: 'C', role: 'usuario', setor: '', ...extra });
      assert.strictEqual(s, 200, `criar ${k}: ${s} ${JSON.stringify(c)}`);
      ctx.id[k] = c.id;
      const [ls, l] = await j('POST', '/auth/login', null, { email, senha: 'Senha!140' });
      assert.strictEqual(ls, 200, `login ${k}`);
      ctx.tok[k] = l.token;
    }
    const us = await all('SELECT id, role, is_superadmin s, pode_aprovar_descontos p FROM usuarios WHERE id IN (?, ?, ?, ?, ?)',
      [ctx.id.super, ctx.id.aprov1, ctx.id.aprov2, ctx.id.vend, ctx.id.adm]);
    const por = Object.fromEntries(us.map((u) => [u.id, [u.role, Number(u.s) || 0, Number(u.p) || 0]]));
    assert.deepStrictEqual([por[ctx.id.super][1], por[ctx.id.super][2]], [1, 0], 'o seed e super sem a coluna');
    assert.deepStrictEqual(por[ctx.id.aprov1], ['usuario', 0, 1]);
    assert.deepStrictEqual(por[ctx.id.vend], ['usuario', 0, 0]);
    assert.deepStrictEqual(por[ctx.id.adm], ['admin', 0, 0]);
    assert.ok(ctx.id.aprov1 < ctx.id.aprov2, 'aprov1 antes de aprov2');
    const [sc, cli] = await j('POST', '/clientes', ctx.T, {
      razao_social: 'Cli 140', nome_fantasia: 'Fant', cnpj: '11.222.333/0001-44', segmento: 'Seg', telefone: '(11) 9999-0000', email: 'a@a.com',
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
    // a segunda subida, com a janela aberta (o mesmo banco; o segredo do token mora na pasta)
    await descer();
    await subir(ATRASO);
    for (const [name, fn] of testesComAtraso) {
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
