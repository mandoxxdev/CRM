/**
 * Etapa 163 (Operacional) — editar uma atividade de colaborador nao apaga o fim, as horas reais nem o status (C407), pelo `index.js` de
 * verdade (pasta vazia).
 *
 *   RN-163.01 (C407)  PUT /operacional/atividades-colaboradores/:id: cada coluna so muda se o campo vier no corpo; o campo presente segue a
 *                     regra de antes (vazio = nulo; status vazio = em_andamento); ausente = continua o que estava
 *   RN-163.02 (C407)  a disponibilidade do colaborador: so com status concluida/cancelada no corpo e sem outra atividade em andamento
 *
 * Antes (reproduzido pela rota contra o codigo de `04fc2495`): o corpo do formulario de edicao (sem status/data_fim/horas_reais) voltava a
 * atividade concluida para em_andamento e apagava o fim e as horas; o PUT so com { status } dava 500 (tipo_atividade NOT NULL).
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa163-a-atividade-editada-e-as-validades-no-dia-de-brasilia.md
 * Executar: cd server && node tests/api/atividadeEditadaGuardaOFim.api.test.js
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
async function cru(m, u, tok, body, ms = 30000) {
  const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  let corpo;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(ms) });
  const buf = Buffer.from(await r.arrayBuffer());
  let x = buf.toString('utf8'); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
const ctx = {};
const j = (m, u, body, tok = ctx.T) => cru(m, `/api${u}`, tok, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e163seed@t.com', senha: 'E163seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'NOMINATIM_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS',
    'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS', 'TZ', 'RELOGIO_ADIANTADO_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha,
    RATE_LIMIT_MAX: '100000', NOMINATIM_URL: 'http://127.0.0.1:9/search' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  filho = spawn(process.execPath, [...preload, 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await cru('POST', '/api/auth/login', null, SEED);
      if (s === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
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

// ── o arquivo, por fora (so leitura, para conferir o que a rota gravou) ─────────────────────────────────────────────────
let banco = null;
function abrirCru() {
  banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  banco.configure('busyTimeout', 15000);
}
const all = (sql, p = []) => new Promise((res, rej) => banco.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const linha = async (id) => (await all('SELECT * FROM atividades_colaboradores WHERE id = ?', [id]))[0];
// o POST e o PUT respondem ANTES do UPDATE de colaboradores (index.js: o db.run da disponibilidade nao e esperado) — le depois de assentar:
// espera ate 3 s pelo valor pedido e devolve o que houver (a assercao compara)
const lerDisponivel = async (colabId) => (await all('SELECT disponivel FROM colaboradores WHERE id = ?', [colabId]))[0].disponivel;
async function disponivel(colabId, esperado) {
  const ate = Date.now() + 3000;
  await pausa(300);
  let v = await lerDisponivel(colabId);
  while (v !== esperado && Date.now() < ate) { await pausa(100); v = await lerDisponivel(colabId); }
  return v;
}

let seq = 0;
async function novoColaborador() {
  seq += 1;
  const [s, r] = await j('POST', '/operacional/colaboradores', { nome: `Colaborador 163 ${seq}`, matricula: `M163-${seq}` });
  assert.strictEqual(s, 200, JSON.stringify(r));
  assert.ok(r.id, JSON.stringify(r));
  return r.id;
}
async function novaAtividade(colabId, extra = {}) {
  const [s, r] = await j('POST', '/operacional/atividades-colaboradores', {
    colaborador_id: colabId, tipo_atividade: 'solda', descricao: 'soldar a base', data_inicio: '2026-10-19T22:30', horas_previstas: 4,
    observacoes: 'obs inicial', ...extra });
  assert.strictEqual(s, 200, JSON.stringify(r));
  return r.id;
}
// a linha como a lista a devolve — e o que o Finalizar espalha no corpo (AtividadesColaboradores.js:49)
async function daLista(id) {
  const [s, l] = await j('GET', '/operacional/atividades-colaboradores');
  assert.strictEqual(s, 200, JSON.stringify(l));
  const a = l.find((x) => x.id === id);
  assert.ok(a, `a atividade ${id} nao esta na lista`);
  return a;
}
// o corpo que o formulario de edicao manda (AtividadeForm.js:21-31, :77): sem status, data_fim, horas_reais
const corpoDoFormulario = (a, mudancas = {}) => ({
  colaborador_id: a.colaborador_id, os_id: a.os_id || '', item_id: a.item_id || '', tipo_atividade: a.tipo_atividade,
  descricao: a.descricao || '', data_inicio: a.data_inicio, horas_previstas: a.horas_previstas || '', observacoes: a.observacoes || '',
  ...mudancas,
});
const FIM = '2026-10-20T01:45:00.000Z';

test('[RN-163.01, C407] editar a atividade concluida com o corpo do formulario muda a descricao e guarda o status, o fim e as horas reais', async () => {
  const colab = await novoColaborador();
  const id = await novaAtividade(colab);
  assert.strictEqual(await disponivel(colab, 0), 0, 'o POST marca o colaborador ocupado');
  // concluir pelo corpo do Finalizar, com as horas reais
  const [sf, rf] = await j('PUT', `/operacional/atividades-colaboradores/${id}`, { ...(await daLista(id)), status: 'concluida', data_fim: FIM, horas_reais: 3.5 });
  assert.strictEqual(sf, 200, JSON.stringify(rf));
  const concluida = await linha(id);
  assert.deepStrictEqual([concluida.status, concluida.data_fim, concluida.horas_reais], ['concluida', FIM, 3.5], 'o Finalizar gravou');
  assert.strictEqual(await disponivel(colab, 1), 1, 'concluida e sem outra em andamento: o colaborador volta a disponivel');

  // editar: so a descricao e as observacoes mudam
  const [se, re] = await j('PUT', `/operacional/atividades-colaboradores/${id}`,
    corpoDoFormulario(await daLista(id), { descricao: 'soldar a base e a tampa', observacoes: 'obs editada' }));
  assert.strictEqual(se, 200, JSON.stringify(re));
  assert.deepStrictEqual(re, { message: 'Atividade atualizada com sucesso' });
  const editada = await linha(id);
  assert.strictEqual(editada.descricao, 'soldar a base e a tampa', 'a metade positiva: a edicao gravou o que veio');
  assert.strictEqual(editada.observacoes, 'obs editada');
  assert.strictEqual(editada.status, 'concluida', 'a edicao reabriu a atividade (C407)');
  assert.strictEqual(editada.data_fim, FIM, 'a edicao apagou o fim (C407)');
  assert.strictEqual(editada.horas_reais, 3.5, 'a edicao apagou as horas reais (C407)');
  assert.strictEqual(editada.tipo_atividade, 'solda');
  assert.strictEqual(await disponivel(colab, 1), 1, 'a edicao sem status nao mexe na disponibilidade');
  // a lista mostra o mesmo (a tela le dela)
  const naLista = await daLista(id);
  assert.deepStrictEqual([naLista.status, naLista.data_fim, naLista.horas_reais], ['concluida', FIM, 3.5]);
  const [, emAndamento] = await j('GET', '/operacional/atividades-colaboradores/em-andamento');
  assert.ok(!emAndamento.some((x) => x.id === id), 'a concluida apareceu entre as em andamento');
});

test('[RN-163.01, C407] o PUT so com { status } conclui (era 500 — tipo_atividade NOT NULL) e nao apaga o resto', async () => {
  const colab = await novoColaborador();
  const id = await novaAtividade(colab);
  const antes = await linha(id);
  const [s, r] = await j('PUT', `/operacional/atividades-colaboradores/${id}`, { status: 'concluida' });
  assert.strictEqual(s, 200, JSON.stringify(r));
  const depois = await linha(id);
  assert.strictEqual(depois.status, 'concluida');
  assert.deepStrictEqual(
    [depois.tipo_atividade, depois.descricao, depois.observacoes, depois.data_inicio, depois.horas_previstas, depois.data_fim, depois.horas_reais],
    [antes.tipo_atividade, antes.descricao, antes.observacoes, antes.data_inicio, antes.horas_previstas, null, null]);
  assert.strictEqual(await disponivel(colab, 1), 1, 'RN-163.02: concluida pelo PUT parcial libera o colaborador');
});

test('[RN-163.01, C407] o campo presente ainda grava: vazio zera o fim, as horas e a descricao; status vazio = em_andamento', async () => {
  const colab = await novoColaborador();
  const id = await novaAtividade(colab);
  await j('PUT', `/operacional/atividades-colaboradores/${id}`, { status: 'concluida', data_fim: FIM, horas_reais: 2 });
  assert.deepStrictEqual([(await linha(id)).data_fim, (await linha(id)).horas_reais], [FIM, 2], 'preparo');
  const [s, r] = await j('PUT', `/operacional/atividades-colaboradores/${id}`, { status: '', data_fim: '', horas_reais: '', descricao: '' });
  assert.strictEqual(s, 200, JSON.stringify(r));
  const l = await linha(id);
  assert.deepStrictEqual([l.status, l.data_fim, l.horas_reais, l.descricao], ['em_andamento', null, null, null]);
  assert.strictEqual(l.observacoes, 'obs inicial', 'o ausente continua');
  assert.strictEqual(l.tipo_atividade, 'solda', 'o ausente continua');
  // tipo_atividade presente: '' grava (como antes); null presente continua recusado pela coluna NOT NULL (como antes — Fase 2 M6)
  const [sv, rv] = await j('PUT', `/operacional/atividades-colaboradores/${id}`, { tipo_atividade: '' });
  assert.strictEqual(sv, 200, JSON.stringify(rv));
  assert.strictEqual((await linha(id)).tipo_atividade, '');
  const [sn, rn] = await j('PUT', `/operacional/atividades-colaboradores/${id}`, { tipo_atividade: null, descricao: 'nao deve gravar' });
  assert.strictEqual(sn, 500, JSON.stringify(rn));
  assert.ok(/NOT NULL/.test(rn.error), JSON.stringify(rn));
  assert.strictEqual((await linha(id)).descricao, null, 'o 500 nao gravou nada');
});

test('[RN-163.01] o corpo sem nenhum dos seis campos: 200 e so o updated_at muda', async () => {
  const colab = await novoColaborador();
  const id = await novaAtividade(colab);
  const antes = await linha(id);
  const [s, r] = await j('PUT', `/operacional/atividades-colaboradores/${id}`, { colaborador_id: 999, os_id: 5, data_inicio: '2001-01-01T00:00' });
  assert.strictEqual(s, 200, JSON.stringify(r));
  const depois = await linha(id);
  const { updated_at: ua, ...restoAntes } = antes;
  const { updated_at: ub, ...restoDepois } = depois;
  assert.deepStrictEqual(restoDepois, restoAntes, 'o PUT mudou coluna que nao grava (C408: OS, inicio e colaborador continuam ignorados)');
  assert.ok(ua !== undefined && ub !== undefined);
});

test('[RN-163.02] cancelar com outra em andamento nao libera o colaborador; cancelar a ultima libera', async () => {
  const colab = await novoColaborador();
  const a = await novaAtividade(colab);
  const b = await novaAtividade(colab, { tipo_atividade: 'pintura' });
  await j('PUT', `/operacional/atividades-colaboradores/${a}`, { status: 'cancelada' });
  assert.strictEqual(await disponivel(colab, 0), 0, 'ainda tem a b em andamento');
  assert.strictEqual((await linha(a)).tipo_atividade, 'solda');
  await j('PUT', `/operacional/atividades-colaboradores/${b}`, { status: 'cancelada' });
  assert.strictEqual(await disponivel(colab, 1), 1, 'a ultima cancelada libera');
  assert.strictEqual((await linha(b)).tipo_atividade, 'pintura');
});

test('[C407] o PUT de atividade que nao existe: 404 com a mensagem', async () => {
  const [s, r] = await j('PUT', '/operacional/atividades-colaboradores/999999', { status: 'concluida' });
  assert.strictEqual(s, 404, JSON.stringify(r));
  assert.deepStrictEqual(r, { error: 'Atividade não encontrada' });
});

(async () => {
  console.log('\n=== Etapa 163: editar a atividade sem apagar o fim (C407) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e163-at-'));
    ctx.T = await subir();
    abrirCru();
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (banco) await new Promise((r) => banco.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
