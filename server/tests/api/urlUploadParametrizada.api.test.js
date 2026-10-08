/**
 * Assinador de upload parametrizado por pasta — Etapa 82, T1 (RN-82.01).
 *
 * Teste de MODULO (sem servidor): o assinador e puro, e o relogio e fixado trocando `Date.now`.
 * O que se prova:
 *  - sem opcoes, a URL e IDENTICA a do algoritmo antigo (reimplementado aqui de proposito, com a
 *    string de dominio literal: se o padrao mudar, este teste acusa — URLs ja emitidas quebrariam);
 *  - assinatura de uma pasta NAO vale em outra (dominio entra na chave);
 *  - `prefixo` sem `dominio` lanca;
 *  - validade longa (chat, 8 h) aceita em +7h59 e recusada depois do teto;
 *  - a conta do balde.
 */
const assert = require('assert');
const crypto = require('crypto');
const {
  criarAssinadorUpload, derivarSegredoUpload,
} = require('../../services/almoxarifado/urlUpload');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const SEGREDO = 'segredo-de-teste-82';
const T0 = 1790000123; // segundos; nao e multiplo de 300 nem de 3600 (exercita o arredondamento)

const dateNowOriginal = Date.now;
function relogio(seg) { Date.now = () => seg * 1000; }
function restaurarRelogio() { Date.now = dateNowOriginal; }

function partes(url) {
  const u = new URL(url, 'http://x');
  return {
    caminho: u.pathname,
    nome: decodeURIComponent(u.pathname.split('/').pop()),
    exp: u.searchParams.get('exp'),
    sig: u.searchParams.get('sig'),
  };
}

/** O algoritmo da Etapa 33, copiado literalmente — a referencia do "byte a byte". */
function assinarAntigo(segredoRaiz, nome, agora) {
  const chave = crypto.createHash('sha256').update(`${segredoRaiz}:almoxarifado-uploads-v1`).digest();
  const exp = Math.ceil(agora / 300) * 300 + 15 * 60;
  const sig = crypto.createHmac('sha256', chave).update(`${nome}:${String(exp)}`).digest('hex').slice(0, 32);
  return `/api/uploads/almoxarifado/${encodeURIComponent(nome)}?exp=${exp}&sig=${sig}`;
}

const chat = () => criarAssinadorUpload(SEGREDO, {
  prefixo: '/api/uploads/chat', dominio: 'chat-uploads-v1', minutos: 480, baldeMinutos: 60,
});
const avatares = () => criarAssinadorUpload(SEGREDO, {
  prefixo: '/api/uploads/avatares', dominio: 'avatares-uploads-v1', minutos: 1440, baldeMinutos: 60,
});

test('sem opcoes: URL identica ao algoritmo antigo (mesmo nome, mesmo relogio)', () => {
  relogio(T0);
  const a = criarAssinadorUpload(SEGREDO);
  for (const nome of ['material-1.png', 'assinatura 9.png', 'acentuação.pdf']) {
    assert.strictEqual(a.assinar(nome), assinarAntigo(SEGREDO, nome, T0), nome);
  }
  assert.strictEqual(a.MINUTOS_VALIDADE, 15);
  assert.strictEqual(a.BALDE_MINUTOS, 5);
  assert.strictEqual(a.PREFIXO, '/api/uploads/almoxarifado');
  // E a chave derivada de 1 argumento e a de sempre.
  assert.ok(derivarSegredoUpload(SEGREDO).equals(
    crypto.createHash('sha256').update(`${SEGREDO}:almoxarifado-uploads-v1`).digest()));
});

test('sem opcoes: teto continua 20 min (15 + balde 5)', () => {
  relogio(T0);
  const a = criarAssinadorUpload(SEGREDO);
  const chave = derivarSegredoUpload(SEGREDO);
  const sigDe = (nome, exp) => crypto.createHmac('sha256', chave).update(`${nome}:${exp}`).digest('hex').slice(0, 32);
  assert.strictEqual(a.verificar('x.png', T0 + 20 * 60, sigDe('x.png', T0 + 20 * 60)), true);
  assert.strictEqual(a.verificar('x.png', T0 + 20 * 60 + 1, sigDe('x.png', T0 + 20 * 60 + 1)), false);
});

test('assinatura cruzada entre pastas e recusada (chat -> avatares, chat -> almoxarifado, almox -> chat)', () => {
  relogio(T0);
  const c = chat(), av = avatares(), almox = criarAssinadorUpload(SEGREDO);
  const p = partes(c.assinar('foto.png'));
  // Metade positiva: sem ela, "false" abaixo passaria com o assinador quebrado.
  assert.strictEqual(c.verificar(p.nome, p.exp, p.sig), true, 'chat nao aceitou a propria assinatura');
  assert.strictEqual(av.verificar(p.nome, p.exp, p.sig), false, 'avatares aceitou assinatura do chat');
  // O exp do chat (8 h) passa do teto do almox (20 min); refaz com exp curto para isolar a CHAVE.
  const chaveChat = derivarSegredoUpload(SEGREDO, 'chat-uploads-v1');
  const expCurto = T0 + 600;
  const sigChatCurto = crypto.createHmac('sha256', chaveChat).update(`foto.png:${expCurto}`).digest('hex').slice(0, 32);
  assert.strictEqual(c.verificar('foto.png', expCurto, sigChatCurto), true);
  assert.strictEqual(almox.verificar('foto.png', expCurto, sigChatCurto), false, 'almox aceitou assinatura do chat');
  const pa = partes(almox.assinar('foto.png'));
  assert.strictEqual(almox.verificar(pa.nome, pa.exp, pa.sig), true);
  assert.strictEqual(c.verificar(pa.nome, pa.exp, pa.sig), false, 'chat aceitou assinatura do almox');
});

test('prefixo sem dominio lanca; prefixo e o informado na URL', () => {
  assert.throws(() => criarAssinadorUpload(SEGREDO, { prefixo: '/api/uploads/chat' }), /dominio obrigatorio/);
  assert.throws(() => criarAssinadorUpload(SEGREDO, { prefixo: '/api/uploads/chat', dominio: '' }), /dominio obrigatorio/);
  assert.throws(() => criarAssinadorUpload(SEGREDO, { prefixo: '/x', dominio: 'd', minutos: 0 }), /minutos/);
  assert.throws(() => criarAssinadorUpload(SEGREDO, { prefixo: '/x', dominio: 'd', baldeMinutos: 1.5 }), /baldeMinutos/);
  relogio(T0);
  assert.ok(chat().assinar('a.png').startsWith('/api/uploads/chat/a.png?exp='));
});

test('validade de 8 h: aceita em +7h59, recusada depois do teto (8 h + balde 1 h)', () => {
  relogio(T0);
  const c = chat();
  const p = partes(c.assinar('a.png'));
  relogio(T0 + 7 * 3600 + 59 * 60);
  assert.strictEqual(c.verificar(p.nome, p.exp, p.sig), true, 'recusou em +7h59');
  relogio(Number(p.exp) + 1);
  assert.strictEqual(c.verificar(p.nome, p.exp, p.sig), false, 'aceitou depois do exp');
  // Teto: exp corretamente assinado alem de minutos + balde e recusado; no limite, aceito.
  relogio(T0);
  const chave = derivarSegredoUpload(SEGREDO, 'chat-uploads-v1');
  const sigDe = (exp) => crypto.createHmac('sha256', chave).update(`a.png:${exp}`).digest('hex').slice(0, 32);
  const limite = T0 + 9 * 3600;
  assert.strictEqual(c.verificar('a.png', limite, sigDe(limite)), true, 'recusou no teto exato');
  assert.strictEqual(c.verificar('a.png', limite + 1, sigDe(limite + 1)), false, 'aceitou alem do teto');
});

test('conta do balde: exp = ceil(agora / balde) * balde + minutos', () => {
  relogio(T0);
  const pChat = partes(chat().assinar('a.png'));
  assert.strictEqual(Number(pChat.exp), Math.ceil(T0 / 3600) * 3600 + 480 * 60);
  const pAlmox = partes(criarAssinadorUpload(SEGREDO).assinar('a.png'));
  assert.strictEqual(Number(pAlmox.exp), Math.ceil(T0 / 300) * 300 + 15 * 60);
  // Estavel dentro do balde, muda no proximo.
  const inicioBalde = Math.ceil(T0 / 3600) * 3600 - 3600 + 1;
  relogio(inicioBalde);
  const e1 = partes(chat().assinar('a.png')).exp;
  relogio(inicioBalde + 3599);
  assert.strictEqual(partes(chat().assinar('a.png')).exp, e1, 'exp mudou dentro do balde');
  relogio(inicioBalde + 3600);
  assert.notStrictEqual(partes(chat().assinar('a.png')).exp, e1, 'exp nao mudou no balde seguinte');
});

(async () => {
  for (const [nome, fn] of testes) {
    try {
      await fn();
      passou++;
      console.log(`  ok  ${nome}`);
    } catch (e) {
      falhou++;
      console.log(`  FALHOU  ${nome}\n    ${e && e.stack ? e.stack : e}`);
    } finally {
      restaurarRelogio();
    }
  }
  console.log(`\nurlUploadParametrizada: ${passou} passou, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
