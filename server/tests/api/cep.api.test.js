/**
 * Etapa 34 — proxy de CEP (RN-34.04), PELA ROTA.
 * Executar: cd server && node tests/api/cep.api.test.js
 *
 * O módulo `routes/cep.js` é montado aqui num express() próprio com um `fetch` INJETADO
 * (`fetchImpl`) — mock legítimo na fronteira HTTP: a ViaCEP é externa, e o que se prova aqui
 * é a tradução do proxy (localidade → cidade, uf → estado, `{erro:true}` → 404, rejeição →
 * 502, menos de 8 dígitos → 400 sem chamar a rede, sem token → 401).
 *
 * Não usa o createTestApp: o módulo de CEP é core (fica ao lado do /api/cnpj no index.js),
 * não depende de banco, e o harness do almoxarifado não o monta.
 */
const assert = require('assert');
const request = require('supertest');
const express = require('express');
const registrarCep = require('../../routes/cep');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const VIACEP_PAULISTA = {
  cep: '01310-100', logradouro: 'Avenida Paulista', complemento: 'de 612 a 1510 - lado par',
  bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP', ibge: '3550308',
};

function montar({ fetchImpl, timeoutMs, user = { id: 1, nome: 'Teste' } } = {}) {
  const app = express();
  app.use(express.json());
  let currentUser = user;
  const fakeAuth = (req, res, next) => {
    if (!currentUser) return res.status(401).json({ error: 'Token não fornecido' });
    req.user = { ...currentUser };
    next();
  };
  registrarCep(app, fakeAuth, { fetchImpl, timeoutMs });
  return { app, setUser(u) { currentUser = u; } };
}

const respostaOk = (json) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });

(async () => {
  console.log('\n═══ Proxy de CEP (API) ═══\n');

  await test('8 digitos com hifen -> 200 {cep, logradouro, bairro, cidade, estado} e chama a ViaCEP com os digitos', async () => {
    const chamadas = [];
    const fetchImpl = (url) => { chamadas.push(url); return respostaOk(VIACEP_PAULISTA); };
    const { app } = montar({ fetchImpl });
    const r = await request(app).get('/api/cep/01310-100');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, {
      cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP',
    });
    assert.strictEqual(chamadas.length, 1);
    assert.strictEqual(chamadas[0], 'https://viacep.com.br/ws/01310100/json/');
  });

  await test('ViaCEP responde {erro: true} -> 404 "CEP não encontrado"', async () => {
    const { app } = montar({ fetchImpl: () => respostaOk({ erro: true }) });
    const r = await request(app).get('/api/cep/99999999');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'CEP não encontrado');
  });

  await test('ViaCEP responde {erro: "true"} (string, como ela faz hoje) -> 404', async () => {
    const { app } = montar({ fetchImpl: () => respostaOk({ erro: 'true' }) });
    const r = await request(app).get('/api/cep/99999999');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'CEP não encontrado');
  });

  await test('fetch rejeita -> 502 "Serviço de CEP indisponível"', async () => {
    const { app } = montar({ fetchImpl: () => Promise.reject(new Error('ECONNRESET')) });
    const r = await request(app).get('/api/cep/01310100');
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.body.error, 'Serviço de CEP indisponível');
  });

  await test('ViaCEP responde HTTP 500 -> 502', async () => {
    const { app } = montar({ fetchImpl: () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }) });
    const r = await request(app).get('/api/cep/01310100');
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.body.error, 'Serviço de CEP indisponível');
  });

  await test('fetch nunca responde -> 502 pelo timeout (producao 8s; aqui injetado curto)', async () => {
    const { app } = montar({ fetchImpl: () => new Promise(() => {}), timeoutMs: 30 });
    const r = await request(app).get('/api/cep/01310100');
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.body.error, 'Serviço de CEP indisponível');
  });

  await test('7 digitos -> 400 "CEP deve ter 8 dígitos" sem chamar a rede', async () => {
    let chamou = false;
    const { app } = montar({ fetchImpl: () => { chamou = true; return respostaOk(VIACEP_PAULISTA); } });
    const r = await request(app).get('/api/cep/0131010');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'CEP deve ter 8 dígitos');
    assert.strictEqual(chamou, false, 'nao chamou a ViaCEP');
  });

  await test('sem token -> 401', async () => {
    const { app, setUser } = montar({ fetchImpl: () => respostaOk(VIACEP_PAULISTA) });
    setUser(null);
    const r = await request(app).get('/api/cep/01310100');
    assert.strictEqual(r.status, 401);
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
