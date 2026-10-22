/**
 * Etapa 184 (T3) — integracao da leitura da liberacao por valor: pela rota ate o ultimo gesto, pelo servico, e a
 * resposta real nas telas do client.
 *
 * - Pela rota (RN-184.04, emendas I1 e I2 da Fase 2): o admin almox grava a alcada (limite 1, aprovador 7) pelo PUT; um
 *   solicitante (NAO o 7) cria pela rota uma requisicao que passa do limite (AGUARDANDO_APROVACAO_VALOR). O ALMOXARIFE le
 *   `souAprovador: false` e o portao real diz o mesmo: `aprovacoes-valor` 403 e `aprovar-valor` 403 com os literais. O
 *   aprovador 7 (GESTOR, nao configura) le `souAprovador: true`, ve a requisicao em `aprovacoes-valor` e o `aprovar-valor`
 *   responde 200, muda o status e grava `aprovador_valor_id = 7`. Nenhum GET da configuracao tem `@` — com a tabela
 *   `usuarios` semeada e a premissa `a1@x.com` afirmada antes (senao o "sem @" passaria por falta de dado).
 * - Pelo servico: `getConfigPublica(db, user, { verIds })` com os 8 usuarios do contrato = o corpo da rota de cada um (a
 *   rota nao acrescenta nem filtra nada alem do `verIds`).
 * - Fixture do client (molde I3 da 183): client/src/components/almoxarifado/__fixtures__/liberacaoValor.rota.json. Aqui,
 *   SEMPRE, a fixture = a resposta real de `aprovadorSemConfigurar` e `adminDoSistema` (JSON identico: chaves, ordem,
 *   tipos, valores) e sem `@`. Com CRM_GRAVAR_FIXTURE=1 so regrava.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa184-aprovadores-da-liberacao-por-valor.md
 * Executar: cd server && node tests/api/liberacaoValorLeituraIntegracao.api.test.js
 * Regravar: cd server && CRM_GRAVAR_FIXTURE=1 node tests/api/liberacaoValorLeituraIntegracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { canConfigureAlmox, isSystemAdmin } = require('../../services/systemPermissions');
const valueApprovalService = require('../../services/almoxarifado/requisitionValueApprovalService');

const FIXTURE = path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'almoxarifado', '__fixtures__',
  'liberacaoValor.rota.json');
const GRAVAR = process.env.CRM_GRAVAR_FIXTURE === '1';

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  COMUM: { id: 21, role: 'user', perfil_almoxarifado: 'CONSULTA' },
  PRODUCAO: { id: 22, role: 'user' },
  ALMOX: { id: 23, nome: 'Almox 184', role: 'user', perfil_almoxarifado: 'ALMOXARIFE' },
  APROV: { id: 7, nome: 'Aprovador Um', role: 'user', perfil_almoxarifado: 'GESTOR' },
  SISADMIN: { id: 5, role: 'admin' },
  ADMALMOX: { id: 4, nome: 'Adm almox 184', role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' },
  ADMMOD: { id: 6, role: 'user', admin_modulos: ['almoxarifado'] },
  SUPER: { id: 1, role: 'admin', is_superadmin: 1 },
  S: { id: 18401, nome: 'Solicitante 184', role: 'user' }, // sem perfil = PRODUCAO; nao e aprovador
};
const API = '/api/almoxarifado';
const URL = `${API}/configuracoes/liberacao-valor`;
const OITO = ['COMUM', 'PRODUCAO', 'ALMOX', 'APROV', 'SISADMIN', 'ADMALMOX', 'ADMMOD', 'SUPER'];

(async () => {
  console.log('\n=== Etapa 184 (T3): integracao da leitura da liberacao por valor ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.SUPER } });
  setUser({ ...USERS.SUPER });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.SUPER) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  // Emenda I1: a tabela `usuarios` existe e tem o e-mail do aprovador — o PUT responde 200 (nao o 500 do harness sem a
  // tabela) e o "sem @" so vale depois da premissa.
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (7, 'Aprovador Um', 'a1@x.com', 1)");
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (9, 'Aprovador Dois', 'a2@x.com', 1)");
  await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (18401, 'Solicitante 184', 's184@x.com', 1)");
  const premissa = async () => {
    const p = await dbGet(db, 'SELECT email FROM usuarios WHERE id = 7');
    assert.strictEqual(p && p.email, 'a1@x.com', 'premissa: usuarios.7 tem e-mail a1@x.com');
  };
  const semear = async () => {
    for (const [k, v] of [['liberacao_valor_ativo', '1'], ['liberacao_valor_limite', '800'], ['liberacao_valor_aprovadores', '[7,9]']]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    }
  };
  await semear();

  // ── Pelo servico: getConfigPublica = corpo da rota, para os 8 ──
  await test('[RN-184.01..04, servico] getConfigPublica(db, user, { verIds }) = o corpo da rota para os 8 usuarios do contrato', async () => {
    const erros = [];
    for (const k of OITO) {
      const u = { ...USERS[k] };
      // eslint-disable-next-line no-await-in-loop
      const r = await como(k).get(URL);
      // eslint-disable-next-line no-await-in-loop
      const s = await valueApprovalService.getConfigPublica(db, u, { verIds: canConfigureAlmox(u) || isSystemAdmin(u) });
      if (r.status !== 200) erros.push(`${k}: rota ${r.status}`);
      else if (JSON.stringify(r.body) !== JSON.stringify(s)) erros.push(`${k}: rota ${JSON.stringify(r.body)} != servico ${JSON.stringify(s)}`);
    }
    assert.deepStrictEqual(erros, [], erros.join(' | '));
  });

  // ── Fixture do client ──
  await test('[RN-184.06, integracao com o client] a fixture versionada = a resposta real de aprovadorSemConfigurar e adminDoSistema, sem "@"', async () => {
    await premissa();
    const real = {
      aprovadorSemConfigurar: (await como('APROV').get(URL)).body,
      adminDoSistema: (await como('SISADMIN').get(URL)).body,
    };
    if (GRAVAR) {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, `${JSON.stringify(real, null, 2)}\n`);
      console.log(`  (fixture regravada: ${FIXTURE})`);
    }
    assert.ok(fs.existsSync(FIXTURE), `fixture ausente: ${FIXTURE} (gere com CRM_GRAVAR_FIXTURE=1)`);
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    for (const k of ['aprovadorSemConfigurar', 'adminDoSistema']) {
      assert.deepStrictEqual(Object.keys(fixture[k] || {}), Object.keys(real[k]), `${k}: chaves da fixture != da resposta real (regrave)`);
      for (const c of Object.keys(real[k])) {
        assert.strictEqual(typeof fixture[k][c], typeof real[k][c], `${k}.${c}: tipo da fixture != da resposta real`);
      }
      assert.strictEqual(JSON.stringify(fixture[k]), JSON.stringify(real[k]), `${k}: fixture != resposta real (regrave)`);
    }
    assert.ok(!JSON.stringify(real).includes('@'), `a resposta real tem "@": ${JSON.stringify(real)}`);
    assert.ok(!JSON.stringify(fixture).includes('@'), 'a fixture tem "@"');
  });

  // ── Pela rota, ate o ultimo gesto ──
  let R;
  const gets = [];
  await test('[RN-184.04, rota] admin almox grava a alcada pelo PUT (200) e o solicitante cria pela rota uma requisicao AGUARDANDO_APROVACAO_VALOR', async () => {
    const put = await como('ADMALMOX').put(URL, { ativo: true, limite: 1, aprovadorIds: [7] });
    assert.strictEqual(put.status, 200, `PUT: ${put.status} ${JSON.stringify(put.body)}`);
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico, custo_unitario)
      VALUES ('E184-1', 'Mat E184', 'PC', 8, 0, 1, 0, 1)`)).lastID;
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-184', itens: [{ material_id: m, quantidade: 4 }],
    });
    assert.strictEqual(cr.status, 201, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    R = cr.body.id;
    const row = await dbGet(db, 'SELECT status, solicitante_id FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR');
    assert.strictEqual(Number(row.solicitante_id), 18401, 'premissa I2: a requisicao NAO e do aprovador 7');
  });

  await test('[RN-184.04, rota] ALMOXARIFE: GET souAprovador false; aprovacoes-valor 403 e aprovar-valor 403 com os literais; status nao muda', async () => {
    const g = await como('ALMOX').get(URL);
    gets.push(g);
    assert.strictEqual(g.status, 200);
    assert.strictEqual(JSON.stringify(g.body), '{"ativo":true,"limite":1,"souAprovador":false}');
    const lista = await como('ALMOX').get(`${API}/requisicoes/aprovacoes-valor`);
    assert.strictEqual(lista.status, 403, `aprovacoes-valor: ${lista.status} ${JSON.stringify(lista.body)}`);
    assert.deepStrictEqual(lista.body, { error: 'Sem permissão para ver aprovações de valor' });
    const ap = await como('ALMOX').put(`${API}/requisicoes/${R}/aprovar-valor`, {});
    assert.strictEqual(ap.status, 403, `aprovar-valor: ${ap.status} ${JSON.stringify(ap.body)}`);
    assert.deepStrictEqual(ap.body, { error: 'Sem permissão para aprovar liberação por valor' });
    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR');
  });

  await test('[RN-184.04, rota] aprovador 7 sem configurar: GET souAprovador true; ve a requisicao em aprovacoes-valor; aprovar-valor 200, status muda e aprovador_valor_id = 7', async () => {
    const g = await como('APROV').get(URL);
    gets.push(g);
    assert.strictEqual(g.status, 200);
    assert.strictEqual(JSON.stringify(g.body), '{"ativo":true,"limite":1,"souAprovador":true}');
    const lista = await como('APROV').get(`${API}/requisicoes/aprovacoes-valor`);
    assert.strictEqual(lista.status, 200, `aprovacoes-valor: ${lista.status} ${JSON.stringify(lista.body)}`);
    assert.ok(Array.isArray(lista.body) && lista.body.some((x) => Number(x.id) === Number(R)), `a requisicao ${R} nao esta na fila do aprovador`);
    const ap = await como('APROV').put(`${API}/requisicoes/${R}/aprovar-valor`, {});
    assert.strictEqual(ap.status, 200, `aprovar-valor: ${ap.status} ${JSON.stringify(ap.body)}`);
    const row = await dbGet(db, 'SELECT status, aprovador_valor_id FROM requisicoes_almoxarifado WHERE id = ?', [R]);
    assert.notStrictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR', 'o status nao mudou');
    assert.strictEqual(Number(row.aprovador_valor_id), 7);
  });

  await test('[RN-184.03, rota] nenhum GET da configuracao no fluxo tem "@" nem a chave aprovadores (com a premissa a1@x.com)', async () => {
    await premissa();
    assert.strictEqual(gets.length, 2, 'premissa: os dois GETs do fluxo foram feitos');
    for (const g of gets) {
      assert.strictEqual(g.status, 200, `GET ${g.status}`);
      assert.ok(!('aprovadores' in g.body), `tem aprovadores: ${JSON.stringify(g.body)}`);
      assert.ok(!JSON.stringify(g.body).includes('@'), `tem "@": ${JSON.stringify(g.body)}`);
    }
  });

  console.log(`\n  ${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
