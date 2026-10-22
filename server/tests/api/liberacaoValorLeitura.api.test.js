/**
 * Etapa 184 — a leitura da liberacao por valor para de entregar nome e e-mail dos aprovadores.
 *
 * Antes, `GET /api/almoxarifado/configuracoes/liberacao-valor` devolvia `getConfigForApi` inteiro a qualquer
 * logado no almoxarifado: `{ ativo, limite, aprovadores: [{ id, nome, email }], aprovadorIds, souAprovador }`.
 * A lista de requisicoes so le `souAprovador`; a aba Liberacao por Valor so le `ativo`, `limite` e
 * `aprovadorIds` (os nomes vem de `GET /usuarios`). Agora:
 *   - quem nao configura o almoxarifado e nao e administrador do sistema recebe `{ ativo, limite, souAprovador }`;
 *   - quem configura (`canConfigureAlmox`) ou e administrador do sistema (`isSystemAdmin`, que abre a aba so
 *     leitura) recebe tambem `aprovadorIds` (so numeros);
 *   - ninguem recebe `aprovadores` (nome/e-mail) por esta leitura, e ela nao consulta mais `usuarios`;
 *   - o PUT nao muda (portao, gravacao, resposta com `aprovadores`).
 *
 * Ordem fixa (emenda M1 da Fase 2): RN-184.01/02/04 -> 03 (laco) -> 05 (PUT) -> ressemear -> 07 (DROP usuarios) por ultimo.
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa184-aprovadores-da-liberacao-por-valor.md
 *
 * Executar: cd server && node tests/api/liberacaoValorLeitura.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

// Usuarios do contrato (plano, tabela "Contrato (congelado)") e a resposta literal de cada um.
const USERS = {
  COMUM: { id: 21, role: 'user', perfil_almoxarifado: 'CONSULTA' },
  PRODUCAO: { id: 22, role: 'user' }, // sem perfil: fallback PRODUCAO
  ALMOX: { id: 23, role: 'user', perfil_almoxarifado: 'ALMOXARIFE' },
  APROV: { id: 7, role: 'user', perfil_almoxarifado: 'GESTOR' },
  SISADMIN: { id: 5, role: 'admin' },
  ADMALMOX: { id: 4, role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' },
  ADMMOD: { id: 6, role: 'user', admin_modulos: ['almoxarifado'] },
  SUPER: { id: 1, role: 'admin', is_superadmin: 1 },
  // Fase 5 (Menores 1 e 2): os papeis em que `isSystemAdmin` (caixa-insensivel, aceita super com qualquer role) e
  // `role === 'admin'` estrito (o `isAprovadorValor` do portao de `/aprovacoes-valor` e `/aprovar-valor`) divergem.
  ADMIN_CAIXA: { id: 31, role: 'Admin' },
  SUPER_ROLE_USER: { id: 32, role: 'user', is_superadmin: 1 },
  SUPER_CAMEL: { id: 33, role: 'user', isSuperAdmin: true },
};
const CENARIOS = [
  { rn: 'RN-184.01', k: 'COMUM', rotulo: 'comum (CONSULTA)', json: '{"ativo":true,"limite":800,"souAprovador":false}' },
  { rn: 'RN-184.01', k: 'PRODUCAO', rotulo: 'PRODUCAO sem perfil', json: '{"ativo":true,"limite":800,"souAprovador":false}' },
  { rn: 'RN-184.01', k: 'ALMOX', rotulo: 'ALMOXARIFE', json: '{"ativo":true,"limite":800,"souAprovador":false}' },
  { rn: 'RN-184.04', k: 'APROV', rotulo: 'aprovador sem configurar (GESTOR, id 7)', json: '{"ativo":true,"limite":800,"souAprovador":true}' },
  { rn: 'RN-184.02', k: 'SISADMIN', rotulo: 'admin do sistema so leitura', json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":true}' },
  { rn: 'RN-184.02', k: 'ADMALMOX', rotulo: 'admin almox (perfil)', json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}' },
  { rn: 'RN-184.02', k: 'ADMMOD', rotulo: 'admin do modulo', json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}' },
  { rn: 'RN-184.02', k: 'SUPER', rotulo: 'super', json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":true}' },
];
// Fase 5: os tres recebem os ids (quem abre a aba no client recebe — Menor 2) e NAO sao aprovadores (o portao real
// responde 403 a eles — Menor 1). Se um dia o criterio de aprovador mudar (B196/B1213), muda aqui e no portao juntos.
const CENARIOS_CAIXA = [
  { k: 'ADMIN_CAIXA', rotulo: "role 'Admin' (caixa alta)", json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}' },
  { k: 'SUPER_ROLE_USER', rotulo: "super com role 'user' (is_superadmin: 1)", json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}' },
  { k: 'SUPER_CAMEL', rotulo: "super com role 'user' (isSuperAdmin: true)", json: '{"ativo":true,"limite":800,"aprovadorIds":[7,9],"souAprovador":false}' },
];
const URL = '/api/almoxarifado/configuracoes/liberacao-valor';
const MSG_PUT_403 = 'Acesso restrito — administrador do Almoxarifado ou Super Administrador';

(async () => {
  console.log('\n=== Etapa 184: a leitura da liberacao por valor sem nome/e-mail dos aprovadores ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.SUPER } });
  setUser({ ...USERS.SUPER });
  // Usuario por requisicao (molde alertaForaDaTrava): logo depois do jsonParser.
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.SUPER) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const criarUsuarios = async () => {
    await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
    await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (7, 'Aprovador Um', 'a1@x.com', 1)");
    await dbRun(db, "INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (9, 'Aprovador Dois', 'a2@x.com', 1)");
  };
  const semear = async () => {
    for (const [k, v] of [['liberacao_valor_ativo', '1'], ['liberacao_valor_limite', '800'], ['liberacao_valor_aprovadores', '[7,9]']]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
    }
  };
  await criarUsuarios();
  await semear();

  // ── RN-184.01 / 04 / 02 — chaves exatas, na ordem do contrato (deepStrictEqual + literal, emenda M2) ──
  for (const c of CENARIOS) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[${c.rn}] ${c.rotulo} -> 200 ${c.json}`, async () => {
      const r = await como(c.k).get(URL);
      assert.strictEqual(r.status, 200, `status ${r.status} ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(r.body, JSON.parse(c.json));
      assert.strictEqual(JSON.stringify(r.body), c.json);
    });
  }

  // ── Fase 5, Menor 2 — quem abre a aba no client (`isSystemAdmin` caixa-insensivel, super com qualquer role) recebe os ids ──
  for (const c of CENARIOS_CAIXA) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-184.02, Fase 5] ${c.rotulo} -> 200 ${c.json}`, async () => {
      const r = await como(c.k).get(URL);
      assert.strictEqual(r.status, 200, `status ${r.status} ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(r.body, JSON.parse(c.json));
      assert.strictEqual(JSON.stringify(r.body), c.json);
      assert.ok(!JSON.stringify(r.body).includes('@'), 'sem e-mail');
    });
  }

  // ── Fase 5, Menor 1 — `souAprovador` diz o mesmo que o portao real (`GET /requisicoes/aprovacoes-valor`) para cada usuario ──
  await test('[RN-184.04, Fase 5] para os 11 usuarios: souAprovador === (GET /requisicoes/aprovacoes-valor responde 200)', async () => {
    const todos = [...CENARIOS, ...CENARIOS_CAIXA];
    assert.strictEqual(todos.length, 11, 'premissa: 8 do contrato + 3 da Fase 5');
    const erros = [];
    let positivos = 0;
    for (const c of todos) {
      // eslint-disable-next-line no-await-in-loop
      const g = await como(c.k).get(URL);
      // eslint-disable-next-line no-await-in-loop
      const p = await como(c.k).get('/api/almoxarifado/requisicoes/aprovacoes-valor');
      if (g.status !== 200) erros.push(`${c.rotulo}: GET liberacao-valor ${g.status}`);
      if (p.status !== 200 && p.status !== 403) erros.push(`${c.rotulo}: aprovacoes-valor ${p.status} ${JSON.stringify(p.body)}`);
      if (p.status === 200) positivos++;
      if (g.body.souAprovador !== (p.status === 200)) {
        erros.push(`${c.rotulo}: souAprovador ${g.body.souAprovador} mas aprovacoes-valor ${p.status}`);
      }
    }
    // Metade positiva: aprovador 7, admin do sistema e super (role admin) passam no portao — o laco nao e so de 403.
    assert.strictEqual(positivos, 3, `premissa: 3 usuarios com aprovacoes-valor 200, veio ${positivos}`);
    assert.deepStrictEqual(erros, [], erros.join(' | '));
  });

  // ── RN-184.03 — ninguem recebe nome nem e-mail ──
  await test('[RN-184.03] os 8 usuarios: sem a chave aprovadores, sem "@", sem "Aprovador Um"/"Aprovador Dois" no JSON', async () => {
    // Premissa (anti-teste-vazio): o e-mail do aprovador existe na base que a rota poderia ler.
    const p = await dbGet(db, 'SELECT email FROM usuarios WHERE id = 7');
    assert.strictEqual(p && p.email, 'a1@x.com', 'premissa: usuarios.7 tem e-mail a1@x.com');
    const erros = [];
    for (const c of CENARIOS) {
      // eslint-disable-next-line no-await-in-loop
      const r = await como(c.k).get(URL);
      const s = JSON.stringify(r.body);
      if (r.status !== 200) erros.push(`${c.rotulo}: status ${r.status}`);
      if (r.body && 'aprovadores' in r.body) erros.push(`${c.rotulo}: tem a chave aprovadores`);
      if (s.includes('@')) erros.push(`${c.rotulo}: JSON contem "@" (${s})`);
      if (s.includes('Aprovador Um') || s.includes('Aprovador Dois')) erros.push(`${c.rotulo}: JSON contem nome de aprovador`);
    }
    assert.deepStrictEqual(erros, [], erros.join(' | '));
  });

  // ── RN-184.05 — o PUT nao muda ──
  await test(`[RN-184.05] ALMOXARIFE -> PUT 403 "${MSG_PUT_403}" e a configuracao nao muda`, async () => {
    // Mesmo corpo da configuracao-base (emenda M1): se o portao cair, nada das linhas seguintes muda.
    const r = await como('ALMOX').put(URL, { ativo: true, limite: 800, aprovadorIds: [7, 9] });
    assert.strictEqual(r.status, 403, `status ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { error: MSG_PUT_403 });
  });
  await test('[RN-184.05] admin almox -> PUT 200, grava, e a resposta AINDA traz aprovadores (com nome/e-mail)', async () => {
    const r = await como('ADMALMOX').put(URL, { ativo: true, limite: 900, aprovadorIds: [7] });
    assert.strictEqual(r.status, 200, `status ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body.aprovadores, [{ id: 7, nome: 'Aprovador Um', email: 'a1@x.com' }]);
    assert.deepStrictEqual(r.body.aprovadorIds, [7]);
    assert.strictEqual(r.body.limite, 900);
    const lim = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'liberacao_valor_limite'");
    assert.strictEqual(lim.valor, '900');
  });
  await semear();

  // ── RN-184.07 — a leitura nao depende mais de `usuarios` (por ultimo: derruba a tabela) ──
  await test('[RN-184.07] sem a tabela usuarios, admin almox -> GET 200 com aprovadorIds [7,9] (antes: 500)', async () => {
    await dbRun(db, 'DROP TABLE usuarios');
    const r = await como('ADMALMOX').get(URL);
    assert.strictEqual(r.status, 200, `status ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { ativo: true, limite: 800, aprovadorIds: [7, 9], souAprovador: false });
  });

  console.log(`\n  ${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
