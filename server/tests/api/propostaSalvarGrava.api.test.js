/**
 * Etapa 146 (propostas) — a criacao, o salvamento e a copia da proposta so respondem depois de gravar os itens, e o salvamento confere o
 * cliente que mudou, pelo `index.js` de verdade (pasta vazia): C323, C322.
 *
 *   RN-146.01  POST /api/propostas: itens em sequencia, resposta depois do ultimo; item que falha -> 500 e nada fica
 *   RN-146.02  PUT /api/propostas/:id: os itens novos ANTES de tudo, os antigos apagados DEPOIS; item que falha -> 500 e nada muda
 *              (cabecalho, numero, revisao, historicos, variaveis manuais, itens antigos); as limpezas que falham -> as frases
 *   RN-146.03  POST /api/propostas/:id/clone: idem a criacao (antes respondia 201 antes de gravar)
 *   RN-146.04  PUT com o cliente que mudou e nao existe -> 400 (antes 500 da chave estrangeira); vazio continua sem cliente (B954)
 *   RN-146.05  a ordem das recusas do PUT
 *   T5         integracao: cria -> variavel manual -> salva trocando o cliente e com item novo -> copia
 *
 * A falha do item e REAL: um gatilho do SQLite gravado por fora (descricao 'FALHA...' -> RAISE(ABORT)) — passa pelo statement preparado
 * de antes desta etapa e pelo `db.run` de agora (o FALHA_SQL_INJETADA so intercepta `Database.prototype`, e prova as limpezas).
 *
 * Molde: propostaGeracaoGrava.api.test.js. Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa146-os-itens-gravados-antes-de-responder.md
 * Executar: cd server && node tests/api/propostaSalvarGrava.api.test.js
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
async function j(m, u, tok, body, texto, ms = 30000) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms),
  });
  if (texto) return [r.status, await r.text()];
  let x = null; try { x = await r.json(); } catch (e) { /* sem corpo */ }
  return [r.status, x];
}
/** A chamada que tem de RESPONDER: 60 s de limite (3 000 itens gravados um a um). */
async function responde(m, u, body, tok = ctx.T) {
  try {
    return await j(m, u, tok, body, false, 60000);
  } catch (e) {
    throw new Error(`${m} ${u} nao respondeu em 60 s (${e.name}) com ${JSON.stringify(body).slice(0, 120)}`);
  }
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e146sgseed@t.com', senha: 'E146sgseed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' }, extraEnv);
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  if (extraEnv.FALHA_SQL_INJETADA) preload.push('-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'));
  const marcas = fs.existsSync(logArq) ? (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length : 0;
  filho = spawn(process.execPath, [...preload, 'index.js'], {
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
        while (Date.now() < ate && (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length <= marcas) await pausa(200);
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
function abrirCru() {
  cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = {};

// As mensagens literais do contrato (o plano). O teste compara com o texto, nao com a constante: trocar a constante tem de derrubar.
const NAO_CLIENTE = (id) => `Cliente não encontrado (id ${id}). Atualize a lista de clientes e tente de novo.`;
const CRIACAO_NADA = (m) => `Erro ao gravar os itens da proposta (${m}). Nenhuma proposta foi criada — tente de novo.`;
const CRIACAO_INCOMPLETA = (m, n) => `Erro ao gravar os itens da proposta (${m}). A proposta ${n} ficou incompleta — exclua-a e gere de novo.`;
const SALVAR_NADA = (m) => `Erro ao gravar os itens da proposta (${m}). Nada foi alterado — tente salvar de novo.`;
const SALVAR_ANTIGOS = (m) => `Erro ao gravar os itens da proposta (${m}). Os outros dados da proposta foram salvos, mas os itens continuam os de antes — confira e salve de novo.`;
const SALVAR_REPETIDOS = (m, n) => `Erro ao gravar os itens da proposta (${m}). A proposta ${n} ficou com itens repetidos — recarregue, confira os itens e salve de novo.`;
const DESCONTO_PUT = 'Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada.';
const GAT = 'SQLITE_CONSTRAINT: falha do gatilho';
const INJ = 'falha injetada pelo teste';

const contar = async () => {
  const [p] = await all('SELECT COUNT(*) AS n FROM propostas');
  const [i] = await all('SELECT COUNT(*) AS n FROM proposta_itens');
  return [p.n, i.n];
};
async function semNada(fn, rotulo) {
  const antes = await contar();
  const r = await fn();
  await pausa(200);
  assert.deepStrictEqual(await contar(), antes, `${rotulo}: criou proposta ou item`);
  return r;
}
/** Tudo o que o salvamento pode mudar numa proposta (o updated_at fica de fora). */
async function estado(id) {
  await pausa(300); // o historico de edicoes e gravado sem esperar
  const [prop] = await all('SELECT numero_proposta, revisao, titulo, valor_total, cliente_id, status, margem_desconto, cliente_contato FROM propostas WHERE id = ?', [id]);
  return {
    prop,
    itens: await all('SELECT id, descricao, modelo, descritivo_tecnico FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [id]),
    revisoes: (await all('SELECT COUNT(*) AS n FROM proposta_revisoes WHERE proposta_id = ?', [id]))[0].n,
    edicoes: (await all('SELECT COUNT(*) AS n FROM proposta_edicoes_log WHERE proposta_id = ?', [id]))[0].n,
    variaveis: await all('SELECT item_id, chave, valor, item_removido_em FROM proposta_variaveis_manuais WHERE proposta_id = ? ORDER BY id', [id]),
    totalItens: (await all('SELECT COUNT(*) AS n FROM proposta_itens'))[0].n,
  };
}
const descricoes = async (id) => (await all('SELECT descricao FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [id])).map((r) => r.descricao);
/** Uma proposta com os itens dados (descricoes), pelo POST, e campos que o formulario nao manda gravados por fora no 1o. */
async function novaProposta(itens = ['X', 'Y', 'Z']) {
  const [s, x] = await responde('POST', '/propostas', {
    titulo: 'Base 146', cliente_id: ctx.clienteId, cliente_contato: 'Maria', valor_total: 30,
    itens: itens.map((d) => ({ descricao: d, quantidade: 1, valor_unitario: 10, valor_total: 10 })),
  });
  assert.strictEqual(s, 200, JSON.stringify(x));
  const ids = (await all('SELECT id FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [x.id])).map((r) => r.id);
  await run("UPDATE proposta_itens SET modelo = 'MOD-1', descritivo_tecnico = 'DT-1' WHERE id = ?", [ids[0]]);
  return { id: x.id, numero: x.numero_proposta, ids };
}
/** O corpo que a tela manda: cada item gravado com o seu id (o pareamento da 142), sem `modelo`/`descritivo_tecnico`. */
const corpoDosItens = (ids, nomes, extra = []) => [
  ...ids.map((id, k) => ({ id, descricao: nomes[k], quantidade: 1, valor_unitario: 10, valor_total: 10 })),
  ...extra.map((d) => ({ descricao: d, quantidade: 1, valor_unitario: 10, valor_total: 10 })),
];
async function variavel(id, itemId, valor) {
  const [s, x] = await j('PUT', `/propostas/${id}/variaveis-manuais`, ctx.T, { valores: [{ item_id: itemId, chave: 'pressao', valor }] });
  assert.strictEqual(s, 200, JSON.stringify(x));
}
async function reboot(env) {
  await descer();
  ctx.T = await subir(env);
}

// ── RN-146.01 (C323): a criacao ──────────────────────────────────────────────────────────
test('[RN-146.01, C323] o 3o de 5 itens falha (gatilho): 500 com a frase e nem proposta nem item ficam (antes: 200 com 4 itens)', async () => {
  const [s, x] = await semNada(() => responde('POST', '/propostas', { titulo: 'P1', cliente_id: ctx.clienteId,
    itens: ['A', 'B', 'FALHA', 'D', 'E'].map((d) => ({ descricao: d })) }), 'post');
  assert.deepStrictEqual([s, x], [500, { error: CRIACAO_NADA(GAT) }]);
  // a metade positiva: sem o item que falha, a proposta nasce com os quatro
  const [s2, x2] = await responde('POST', '/propostas', { titulo: 'P1', cliente_id: ctx.clienteId, itens: ['A', 'B', 'D', 'E'].map((d) => ({ descricao: d })) });
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  assert.deepStrictEqual(await descricoes(x2.id), ['A', 'B', 'D', 'E']);
});

test('[RN-146.01] 2 000 itens: no instante do 200 os 2 000 estao no banco, com os acessorios', async () => {
  const itens = Array.from({ length: 2000 }, (_, i) => ({ descricao: 'I' + i, quantidade: 1, valor_unitario: 1, acessorios: i === 1999 ? [{ descricao: 'ACX', quantidade: 2, valor_unitario: 5 }] : [] }));
  const [s, x] = await responde('POST', '/propostas', { titulo: 'P5', cliente_id: ctx.clienteId, itens });
  assert.strictEqual(s, 200, JSON.stringify(x).slice(0, 200));
  const [n] = await all('SELECT COUNT(*) AS n, MAX(numero_item) AS ultimo FROM proposta_itens WHERE proposta_id = ?', [x.id]);
  assert.deepStrictEqual([n.n, n.ultimo], [2000, 2000], 'a resposta saiu antes de gravar todos os itens');
  const [u] = await all('SELECT acessorios FROM proposta_itens WHERE proposta_id = ? AND numero_item = 2000', [x.id]);
  assert.deepStrictEqual(JSON.parse(u.acessorios), [{ descricao: 'ACX', quantidade: 2, valor_unitario: 5 }], 'a coluna acessorios deixou de ser gravada');
});

// ── RN-146.03: a copia ───────────────────────────────────────────────────────────────────
test('[RN-146.03, C323] a copia de uma proposta com um item que falha: 500 com a frase e nenhuma copia (antes: 201 com 2 de 3)', async () => {
  const [s, x] = await semNada(() => responde('POST', `/propostas/${ctx.comFalha}/clone`, {}), 'clone');
  assert.deepStrictEqual([s, x], [500, { error: CRIACAO_NADA(GAT) }]);
});

test('[RN-146.03] a copia de 300 itens responde 201 com os 300 gravados, com a descricao da tabela e os acessorios', async () => {
  const [s0, x0] = await responde('POST', '/propostas', { titulo: 'Origem', cliente_id: ctx.clienteId,
    itens: Array.from({ length: 300 }, (_, i) => ({ descricao: 'O' + i, acessorios: [{ descricao: 'AC' + i }] })) });
  assert.strictEqual(s0, 200, JSON.stringify(x0).slice(0, 200));
  await run("UPDATE proposta_itens SET descricao_tabela = 'TAB' || numero_item WHERE proposta_id = ?", [x0.id]);
  const [s, x] = await responde('POST', `/propostas/${x0.id}/clone`, {});
  assert.strictEqual(s, 201, JSON.stringify(x));
  const linhas = await all('SELECT descricao_tabela, acessorios FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [x.id]);
  assert.strictEqual(linhas.length, 300, 'a copia respondeu antes de gravar os itens');
  assert.deepStrictEqual([linhas[299].descricao_tabela, JSON.parse(linhas[299].acessorios)], ['TAB300', [{ descricao: 'AC299', quantidade: 1, valor_unitario: 0 }]]);
});

// ── RN-146.02 (C323 no PUT): o salvamento ────────────────────────────────────────────────
test('[RN-146.02, C323] o PUT com um item novo que falha (o 4o, depois de 3 gravados): 500 e NADA muda (antes: 200 e o item sumia)', async () => {
  const p = await novaProposta();
  await variavel(p.id, p.ids[1], 'PV-Y');
  const antes = await estado(p.id);
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'Novo titulo', valor_total: 999,
    itens: corpoDosItens(p.ids, ['X', 'Y2', 'Z'], ['FALHA']) });
  assert.deepStrictEqual([s, x], [500, { error: SALVAR_NADA(GAT) }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o salvamento que falhou mudou a proposta');
});

test('[RN-146.02, Etapa 142] o PUT que grava: so os itens novos na resposta, o campo preservado, a variavel religada e o historico', async () => {
  const p = await novaProposta();
  await variavel(p.id, p.ids[1], 'PV-Y');
  const antes = await estado(p.id);
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'Novo titulo', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  assert.strictEqual(s, 200, JSON.stringify(x));
  const depois = await estado(p.id);
  assert.deepStrictEqual(depois.itens.map((i) => i.descricao), ['X', 'Y', 'Z', 'W'], 'itens antigos ficaram ou faltou item');
  assert.ok(depois.itens.every((i) => i.id > Math.max(...p.ids)), 'os itens nao foram regravados');
  assert.deepStrictEqual([depois.itens[0].modelo, depois.itens[0].descritivo_tecnico], ['MOD-1', 'DT-1'], 'a mesclagem da 142 nao preservou');
  assert.deepStrictEqual(depois.variaveis.map((v) => [v.item_id, v.valor, v.item_removido_em]), [[depois.itens[1].id, 'PV-Y', null]], 'a variavel do Y nao foi religada');
  assert.strictEqual(depois.totalItens, antes.totalItens + 1);
  assert.strictEqual(depois.prop.revisao, antes.prop.revisao + 1);
  const log = await all("SELECT tipo, campo FROM proposta_edicoes_log WHERE proposta_id = ? AND tipo LIKE 'item_%'", [p.id]);
  assert.deepStrictEqual(log.map((l) => [l.tipo, l.campo]), [['item_adicionado', 'W']]);
});

test('[RN-146.02] 2 000 itens no PUT: no instante do 200, so os 2 000 novos', async () => {
  const p = await novaProposta();
  const itens = Array.from({ length: 2000 }, (_, i) => ({ descricao: 'N' + i, quantidade: 1, valor_unitario: 1 }));
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { itens });
  assert.strictEqual(s, 200, JSON.stringify(x));
  const [n] = await all('SELECT COUNT(*) AS n, MIN(id) AS menor FROM proposta_itens WHERE proposta_id = ?', [p.id]);
  assert.strictEqual(n.n, 2000, 'a resposta saiu com os antigos ainda la ou antes dos novos');
  assert.ok(n.menor > Math.max(...p.ids));
});

test('[RN-146.02, Fase 2 I-1/I-2] os dois testes de numero duplicado depois dos itens novos: o 400 de antes, itens e revisoes intactos', async () => {
  const p = await novaProposta();
  const outra = await novaProposta(['Q']);
  const antes = await estado(p.id);
  // sem revisao (itens iguais): o ramo que confere o numero enviado
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { numero_proposta: outra.numero, itens: corpoDosItens(p.ids, ['X', 'Y', 'Z']) });
  assert.deepStrictEqual([s, x], [400, { error: 'O número da proposta já está em uso por outra proposta.' }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o numero duplicado (sem revisao) deixou itens novos');
  // com revisao (item novo): o REV01 calculado ja e de outra proposta -> o teste de dentro da gravacao
  const rev01 = p.numero.replace(/REV00$/, 'REV01');
  assert.notStrictEqual(rev01, p.numero);
  const [sb, xb] = await responde('POST', '/propostas', { titulo: 'Ocupa REV01', cliente_id: ctx.clienteId, numero_proposta: rev01 });
  assert.deepStrictEqual([sb, xb && xb.numero_proposta], [200, rev01]);
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  assert.deepStrictEqual([s2, x2], [400, { error: `O número da proposta "${rev01}" já está em uso por outra proposta. Por favor, use outro número ou deixe o sistema gerar automaticamente.` }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o numero duplicado (com revisao) deixou itens novos ou gravou a revisao');
});

test('[RN-146.02, Fase 2 I-3] o 409 da guarda (outra gravacao mudou a margem no meio dos itens): a resposta de antes e os itens antigos', async () => {
  const p = await novaProposta();
  const antes = await estado(p.id);
  await run("CREATE TRIGGER muda_margem_e146 AFTER INSERT ON proposta_itens WHEN NEW.descricao = 'MUDA' BEGIN UPDATE propostas SET margem_desconto = 3 WHERE id = NEW.proposta_id; END;");
  try {
    const [s, x] = await responde('PUT', `/propostas/${p.id}`, { status: 'rascunho', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['MUDA']) });
    assert.deepStrictEqual([s, x], [409, { error: 'A proposta foi alterada por outra gravação no mesmo instante. Recarregue a proposta e salve de novo.', code: 'PROPOSTA_ALTERADA' }]);
    const e = await estado(p.id);
    assert.strictEqual(e.prop.margem_desconto, 3, 'o gatilho (a outra gravacao) nao rodou');
    assert.deepStrictEqual({ ...e, prop: { ...e.prop, margem_desconto: antes.prop.margem_desconto } }, antes, 'o 409 deixou itens novos ou a revisao');
  } finally {
    await run('DROP TRIGGER muda_margem_e146');
  }
});

test('[RN-146.02] itens: [] apaga todos (contrato da 138) e a resposta e a de sempre', async () => {
  const p = await novaProposta();
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { itens: [] });
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(await descricoes(p.id), []);
});

// ── RN-146.04/05 (C322): o cliente do PUT ────────────────────────────────────────────────
test('[RN-146.04, C322] o cliente que mudou e nao existe: 400 com a frase e nada muda (antes: 500 com a mensagem da chave estrangeira)', async () => {
  const p = await novaProposta();
  const antes = await estado(p.id);
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { cliente_id: 99999, titulo: 'Troca' });
  assert.deepStrictEqual([s, x], [400, { error: NAO_CLIENTE(99999) }]);
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { cliente_id: '88888', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['FALHA']) });
  assert.deepStrictEqual([s2, x2], [400, { error: NAO_CLIENTE(88888) }], 'o cliente vem antes dos itens');
  assert.deepStrictEqual(await estado(p.id), antes);
});

test('[RN-146.04, B954, B947] o mesmo cliente, outro que existe e o inativo passam; vazio continua gravando sem cliente', async () => {
  const p = await novaProposta();
  const r1 = await responde('PUT', `/propostas/${p.id}`, { cliente_id: ctx.clienteId, titulo: 'Mesmo' });
  assert.strictEqual(r1[0], 200, JSON.stringify(r1[1]));
  await run("UPDATE clientes SET status = 'inativo' WHERE id = ?", [ctx.outroCliente]);
  const r2 = await responde('PUT', `/propostas/${p.id}`, { cliente_id: String(ctx.outroCliente) });
  assert.strictEqual(r2[0], 200, JSON.stringify(r2[1]));
  let e = await estado(p.id);
  assert.deepStrictEqual([e.prop.cliente_id, e.prop.cliente_contato], [ctx.outroCliente, null], 'trocar o cliente apaga o contato (138)');
  // B954 (Fase 2 M-7): vazio, texto, zero, negativo e nulo continuam gravando sem cliente (a transformacao de sempre — X09b da 138)
  for (const v of ['', 'abc', 0, -5, null]) {
    await run('UPDATE propostas SET cliente_id = ? WHERE id = ?', [ctx.clienteId, p.id]);
    const r3 = await responde('PUT', `/propostas/${p.id}`, { cliente_id: v });
    assert.strictEqual(r3[0], 200, `${JSON.stringify(v)}: ${JSON.stringify(r3[1])}`);
    e = await estado(p.id);
    assert.strictEqual(e.prop.cliente_id, null, `B954: ${JSON.stringify(v)} continua gravando sem cliente`);
  }
  // gravado sem cliente e o corpo sem cliente de novo: nada a conferir
  const r4 = await responde('PUT', `/propostas/${p.id}`, { cliente_id: null, titulo: 'Sem cliente' });
  assert.strictEqual(r4[0], 200, JSON.stringify(r4[1]));
});

test('[RN-146.05] a ordem: o 404 e o 403 do desconto vem antes do cliente que nao existe', async () => {
  const p = await novaProposta();
  const [s1, x1] = await responde('PUT', '/propostas/999999', { cliente_id: 99999 });
  assert.deepStrictEqual([s1, x1], [404, { error: 'Proposta não encontrada' }]);
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { cliente_id: 99999, margem_desconto: 10, status: 'enviada' });
  assert.deepStrictEqual([s2, x2], [403, { error: DESCONTO_PUT }]);
});

// ── T5: integracao (cria -> variavel -> salva com cliente novo e item novo -> copia) ─────
test('[T5, RN-146.01/02/03/04] cria, preenche a variavel, salva trocando o cliente e com item novo, copia: tudo gravado em cada resposta', async () => {
  const [s1, x1] = await responde('POST', '/propostas', { titulo: 'Fluxo', cliente_id: ctx.clienteId, itens: ['A', 'B', 'C'].map((d) => ({ descricao: d })) });
  assert.strictEqual(s1, 200, JSON.stringify(x1));
  const ids = (await all('SELECT id FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [x1.id])).map((r) => r.id);
  assert.strictEqual(ids.length, 3);
  await variavel(x1.id, ids[1], 'PV-B');
  const [s2, x2] = await responde('PUT', `/propostas/${x1.id}`, { cliente_id: ctx.terceiroCliente, itens: corpoDosItens(ids, ['A', 'B', 'C'], ['D']) });
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  const e = await estado(x1.id);
  assert.deepStrictEqual([e.prop.cliente_id, e.itens.map((i) => i.descricao)], [ctx.terceiroCliente, ['A', 'B', 'C', 'D']]);
  assert.deepStrictEqual(e.variaveis.map((v) => [v.item_id, v.valor]), [[e.itens[1].id, 'PV-B']]);
  const [s3, x3] = await responde('POST', `/propostas/${x1.id}/clone`, {});
  assert.strictEqual(s3, 201, JSON.stringify(x3));
  assert.deepStrictEqual(await descricoes(x3.id), ['A', 'B', 'C', 'D']);
  // e o salvamento seguinte com cliente que nao existe e um item que falha: o 400 do cliente e nada muda
  const [s4, x4] = await responde('PUT', `/propostas/${x1.id}`, { cliente_id: 99999, itens: [{ descricao: 'FALHA' }] });
  assert.deepStrictEqual([s4, x4], [400, { error: NAO_CLIENTE(99999) }]);
  assert.deepStrictEqual({ ...(await estado(x1.id)), totalItens: 0 }, { ...e, totalItens: 0 });
});

// ── Fase 5 ───────────────────────────────────────────────────────────────────────────────
test('[RN-146.02, Fase 5 r1/r2] dois salvamentos ao mesmo tempo nunca deixam a proposta sem itens (a 1a versao: 0 itens, os dois 200)', async () => {
  const nomes = Array.from({ length: 20 }, (_, i) => 'C' + i);
  for (let rodada = 0; rodada < 3; rodada++) {
    const p = await novaProposta(nomes);
    const corpo = { itens: corpoDosItens(p.ids, nomes, ['NOVO']) };
    const [a, b] = await Promise.all([responde('PUT', `/propostas/${p.id}`, corpo), responde('PUT', `/propostas/${p.id}`, corpo)]);
    assert.deepStrictEqual([a[0], b[0]], [200, 200], JSON.stringify([a[1], b[1]]));
    const n = (await descricoes(p.id)).length;
    assert.ok(n >= 21, `rodada ${rodada}: a proposta ficou com ${n} itens (esperado pelo menos os 21 de um dos salvamentos)`);
  }
});

test('[RN-146.02, Fase 5 r3 R9] o salvamento sem mudanca de itens nem de valor nao grava revisao', async () => {
  const p = await novaProposta();
  const antes = await estado(p.id);
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'So o titulo' });
  assert.strictEqual(s, 200, JSON.stringify(x));
  const e = await estado(p.id);
  assert.deepStrictEqual([e.revisoes, e.prop.revisao, e.prop.titulo], [antes.revisoes, antes.prop.revisao, 'SO O TITULO']);
});

test('[RN-146.02, Fase 5 r3 R14] o salvamento grava os acessorios do item e a lista vazia os limpa', async () => {
  const p = await novaProposta(['A']);
  const ac = [{ descricao: 'ACX', quantidade: 2, valor_unitario: 5 }];
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { itens: [{ id: p.ids[0], descricao: 'A', acessorios: ac }] });
  assert.strictEqual(s, 200, JSON.stringify(x));
  let [it] = await all('SELECT id, acessorios FROM proposta_itens WHERE proposta_id = ?', [p.id]);
  assert.deepStrictEqual(JSON.parse(it.acessorios), ac);
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { itens: [{ id: it.id, descricao: 'A', acessorios: [] }] });
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  [it] = await all('SELECT acessorios FROM proposta_itens WHERE proposta_id = ?', [p.id]);
  assert.deepStrictEqual(JSON.parse(it.acessorios), []);
});

test('[RN-146.04, Fase 5 r3 R17] o cliente e conferido pela mesma regua que o grava ("99999abc" e "0x1869F" sao o 99999)', async () => {
  const p = await novaProposta();
  const antes = await estado(p.id);
  for (const v of ['99999abc', '0x1869F', ' 99999']) {
    const [s, x] = await responde('PUT', `/propostas/${p.id}`, { cliente_id: v });
    assert.deepStrictEqual([s, x], [400, { error: NAO_CLIENTE(99999) }], JSON.stringify(v));
  }
  assert.deepStrictEqual(await estado(p.id), antes);
});

// ── as limpezas, com a falha injetada (reboots) ──────────────────────────────────────────
test('[RN-146.01] a limpeza da criacao que falha: 500 dizendo que a proposta ficou incompleta', async () => {
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens|^DELETE FROM propostas WHERE', FALHA_SQL_PULAR: '2',
    FALHA_SQL_MSGS: JSON.stringify({ '^DELETE FROM propostas WHERE': 'limpeza presa' }) });
  const [p0, i0] = await contar();
  const [s, x] = await responde('POST', '/propostas', { titulo: 'Inc', cliente_id: ctx.clienteId, itens: ['A', 'B', 'C', 'D'].map((d) => ({ descricao: d })) });
  await pausa(200);
  const [ult] = await all('SELECT numero_proposta FROM propostas ORDER BY id DESC LIMIT 1');
  assert.deepStrictEqual([s, x], [500, { error: CRIACAO_INCOMPLETA(INJ, ult.numero_proposta) }]);
  assert.deepStrictEqual(await contar(), [p0 + 1, i0], 'a proposta incompleta devia ficar, sem itens');
});

test('[RN-146.02] o 3o de 5 itens novos falha (injetado): 500 e nada muda; a limpeza dos novos que falha: "itens repetidos"', async () => {
  await reboot({});
  const p = await novaProposta();
  const antes = await estado(p.id);
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens', FALHA_SQL_PULAR: '2' });
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'T', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['V', 'W']) });
  assert.deepStrictEqual([s, x], [500, { error: SALVAR_NADA(INJ) }]);
  assert.deepStrictEqual(await estado(p.id), antes);
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens|^DELETE FROM proposta_itens WHERE proposta_id = \\? AND id IN ', FALHA_SQL_PULAR: '1',
    FALHA_SQL_MSGS: JSON.stringify({ '^DELETE FROM proposta_itens': 'limpeza presa' }) });
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'T', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z']) });
  assert.deepStrictEqual([s2, x2], [500, { error: SALVAR_REPETIDOS(INJ, p.numero) }]);
  const e = await estado(p.id);
  assert.deepStrictEqual([e.prop.titulo, e.itens.length], [antes.prop.titulo, 4], 'devia ficar o cabecalho de antes, os 3 antigos e o 1 novo');
});

test('[RN-146.02] os antigos que nao saem: 500 "continuam os de antes", o cabecalho salvo e nenhum item novo (tambem com itens: [])', async () => {
  await reboot({});
  const p = await novaProposta();
  const antes = await estado(p.id);
  await reboot({ FALHA_SQL_INJETADA: '^DELETE FROM proposta_itens WHERE id IN ' });
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'Salvo', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  assert.deepStrictEqual([s, x], [500, { error: SALVAR_ANTIGOS(INJ) }]);
  const e = await estado(p.id);
  assert.deepStrictEqual([e.prop.titulo, e.itens], ['SALVO', antes.itens], 'o cabecalho devia estar salvo e os itens os de antes');
  assert.strictEqual(e.edicoes, antes.edicoes, 'Fase 5 r3 R10: o historico de itens foi gravado num salvamento cujos itens nao trocaram');
  for (const vazio of [[], null]) {
    const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { itens: vazio });
    assert.deepStrictEqual([s2, x2], [500, { error: SALVAR_ANTIGOS(INJ) }], `itens: ${JSON.stringify(vazio)}`);
    assert.deepStrictEqual((await estado(p.id)).itens, antes.itens);
  }
});

test('[RN-146.02, RN-146.04] o UPDATE que falha depois dos itens novos: a resposta de antes e os itens intactos; a leitura do cliente que falha: 500', async () => {
  await reboot({});
  const p = await novaProposta();
  const antes = await estado(p.id);
  await reboot({ FALHA_SQL_INJETADA: '^UPDATE propostas SET|^SELECT id FROM clientes WHERE id = \\?$' });
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'T', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  assert.deepStrictEqual([s, x], [500, { error: `Erro ao atualizar proposta: ${INJ}` }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o UPDATE que falhou deixou itens novos ou a revisao');
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { cliente_id: ctx.outroCliente });
  assert.deepStrictEqual([s2, x2], [500, { error: `Erro ao verificar o cliente: ${INJ}` }]);
  await reboot({});
});

// ── Fase 5 r3: os ramos de limpeza que nenhum cenario percorria ──────────────────────────
const DUP_REV = (n) => `O número da proposta "${n}" já está em uso por outra proposta. Por favor, use outro número ou deixe o sistema gerar automaticamente.`;
async function comRev01Ocupado() {
  const p = await novaProposta();
  const rev01 = p.numero.replace(/REV00$/, 'REV01');
  const [s, x] = await responde('POST', '/propostas', { titulo: 'Ocupa REV01', cliente_id: ctx.clienteId, numero_proposta: rev01 });
  assert.deepStrictEqual([s, x && x.numero_proposta], [200, rev01]);
  return { ...p, rev01 };
}

test('[RN-146.02, Fase 5 r3 R1-R3] a recusa depois dos itens novos com a limpeza deles falhando: "itens repetidos" com a frase da recusa e o numero gravado', async () => {
  await reboot({});
  const p = await comRev01Ocupado();
  await reboot({ FALHA_SQL_INJETADA: '^DELETE FROM proposta_itens WHERE proposta_id = \\? AND id IN ', FALHA_SQL_MSGS: JSON.stringify({ '^DELETE FROM proposta_itens': 'limpeza presa' }) });
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  assert.deepStrictEqual([s, x], [500, { error: SALVAR_REPETIDOS(DUP_REV(p.rev01), p.numero) }]);
  assert.strictEqual((await descricoes(p.id)).length, 7, 'os 3 antigos e os 4 novos que nao sairam');
});

test('[RN-146.02, Fase 5 r3 R4/R5] os antigos que nao saem e os novos tambem nao: "itens repetidos" com o numero ja gravado (REV01)', async () => {
  await reboot({});
  const p = await novaProposta();
  await reboot({ FALHA_SQL_INJETADA: '^DELETE FROM proposta_itens WHERE (id IN |proposta_id = \\? AND id IN )' });
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  const rev01 = p.numero.replace(/REV00$/, 'REV01');
  assert.deepStrictEqual([s, x], [500, { error: SALVAR_REPETIDOS(INJ, rev01) }]);
  const e = await estado(p.id);
  assert.deepStrictEqual([e.prop.numero_proposta, e.itens.length], [rev01, 7]);
});

test('[RN-146.02, Fase 5 r3 R20/R21] o 400 do UNIQUE e o 500 da leitura do numero (os dois ramos) desfazem os itens novos', async () => {
  await reboot({});
  const p = await novaProposta();
  const antes = await estado(p.id);
  await reboot({ FALHA_SQL_INJETADA: '^UPDATE propostas SET', FALHA_SQL_MSG: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: propostas.numero_proposta' });
  const [s, x] = await responde('PUT', `/propostas/${p.id}`, { titulo: 'T', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  const rev01 = p.numero.replace(/REV00$/, 'REV01');
  assert.deepStrictEqual([s, x], [400, { error: `O número da proposta "${rev01}" já está em uso. Por favor, use outro número ou deixe o sistema gerar automaticamente.` }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o 400 do UNIQUE deixou itens novos');
  await reboot({ FALHA_SQL_INJETADA: '^SELECT id FROM propostas WHERE numero_proposta' });
  // sem revisao (os mesmos itens, um numero novo): o ramo que confere o numero enviado
  const [s1, x1] = await responde('PUT', `/propostas/${p.id}`, { numero_proposta: 'E146-NOVO-REV00', itens: corpoDosItens(p.ids, ['X', 'Y', 'Z']) });
  assert.deepStrictEqual([s1, x1], [500, { error: `Erro ao verificar número da proposta: ${INJ}` }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o 500 do numero (sem revisao) deixou itens novos');
  // com revisao (item novo): o teste de dentro da gravacao
  const [s2, x2] = await responde('PUT', `/propostas/${p.id}`, { itens: corpoDosItens(p.ids, ['X', 'Y', 'Z'], ['W']) });
  assert.deepStrictEqual([s2, x2], [500, { error: `Erro ao verificar número da proposta: ${INJ}` }]);
  assert.deepStrictEqual(await estado(p.id), antes, 'o 500 do numero (com revisao) deixou itens novos');
});

test('[RN-146.03, Fase 5 r3 R22] a copia cuja leitura dos itens falha: 500 com a frase e nenhuma copia', async () => {
  await reboot({ FALHA_SQL_INJETADA: '^SELECT \\* FROM proposta_itens WHERE proposta_id = \\? ORDER BY id', FALHA_SQL_METODOS: 'all' });
  const p = (await all('SELECT id FROM propostas ORDER BY id LIMIT 1'))[0];
  const [s, x] = await semNada(() => responde('POST', `/propostas/${p.id}/clone`, {}), 'clone');
  assert.deepStrictEqual([s, x], [500, { error: CRIACAO_NADA(INJ) }]);
  await reboot({});
});

(async () => {
  console.log('\n=== Etapa 146 (propostas): a criacao, o salvamento e a copia gravam os itens antes de responder; o cliente do salvamento (C323, C322) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e146-salvar-'));
    ctx.T = await subir();
    abrirCru();
    const cli = async (nome, cnpj) => {
      const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: nome, cnpj, email: 'a@a.com' });
      assert.strictEqual(sc, 200, JSON.stringify(c));
      return c.id;
    };
    ctx.clienteId = await cli('Cli 146', '11.222.333/0001-46');
    ctx.outroCliente = await cli('Cli 146 outro', '11.222.333/0001-47');
    ctx.terceiroCliente = await cli('Cli 146 terceiro', '11.222.333/0001-48');
    // a origem da copia que falha: gravada ANTES do gatilho
    const [sp, pc] = await responde('POST', '/propostas', { titulo: 'Origem com falha', cliente_id: ctx.clienteId, itens: ['C1', 'FALHA C', 'C3'].map((d) => ({ descricao: d })) });
    assert.strictEqual(sp, 200, JSON.stringify(pc));
    ctx.comFalha = pc.id;
    await run("CREATE TRIGGER falha_item_e146 BEFORE INSERT ON proposta_itens WHEN NEW.descricao LIKE 'FALHA%' BEGIN SELECT RAISE(ABORT, 'falha do gatilho'); END;");
    // controle do gatilho: o INSERT por fora com 'FALHA' tem de falhar
    let pegou = false;
    try { await run("INSERT INTO proposta_itens (proposta_id, descricao) VALUES (?, 'FALHA X')", [ctx.comFalha]); } catch (e) { pegou = /falha do gatilho/.test(e.message); }
    assert.ok(pegou, 'o gatilho nao esta falhando o INSERT');
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
