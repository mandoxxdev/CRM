/**
 * Etapa 182 (T2) — a 16a entrada do registro de alertas: `SEPARADO_AGUARDANDO_RETIRADA` (feature 20, com a 05).
 *
 * A caixa separada e liberada para retirada (PRONTA_PARA_RETIRADA) ocupa a area de expedicao e segura material que ninguem
 * busca, e nada cobrava isso. A regua e a coluna `pronta_para_retirada_em` da T1 (a ULTIMA liberacao, escrita pelo trigger).
 * RN-182.04 (regua e saidas), .05 (dedupe por liberacao), .06 (config semeada e o 400 do prefixo `alerta_`), .07 (textos, a
 * hora em Brasilia), .08 (a central continua `ver_alertas`).
 *
 * ⚠️ Toda assercao da fila filtra por hash (evento|chave): as requisicoes semeadas aqui caem tambem em outros alertas do
 * registro (REQUISICAO_ATRASADA etc.), e um contador global mediria o alerta errado (nota de `alertaRegistro.api.test.js`).
 * ⚠️ A emenda I2 da revisao: cada liberacao e envelhecida para um valor DIFERENTE — a chave tem resolucao de segundo.
 *
 * Casos `[182 RN-xx]`. Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa182-alerta-de-retirada-parada.md
 *
 * Executar: cd server && node tests/api/alertaRetiradaParada.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const queueService = require('../../services/almoxarifado/notificationQueueService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 182b', role: 'admin', is_superadmin: 1, email: 'a182b@t.com' },
  S: { id: 18211, nome: 'Solic 182b', role: 'user', email: 's182b@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 18212, nome: 'Almox 182b', role: 'user', email: 'x182b@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const EVENTO = 'SEPARADO_AGUARDANDO_RETIRADA';
const CONFIG = 'alerta_retirada_parada_dias';
const hash = (chave) => crypto.createHash('sha256').update(`${EVENTO}|${chave}`).digest('hex');
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 182 (T2): alerta de separado aguardando retirada ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const setConfig = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await setConfig('alertas_estoque_emails', 'almox@gmp.ind.br');
  await setConfig('alertas_estoque_notificar_email', '1');

  const material = async () => {
    const c = `E182A-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, material_critico) VALUES (?, ?, 'PC', 0, 0, 1, 0.1, 0)`, [c, c])).lastID;
  };
  /** Requisicao real: S pede `qs` de N materiais, ADMIN aprova, entra o estoque, ALMOX separa `sep[i]` de cada e libera. */
  const pronta = async ({ qs = [4], sep = null, setor = 'Comercial', os = 'OS-182' } = {}) => {
    const ms = [];
    for (let i = 0; i < qs.length; i++) ms.push(await material()); // eslint-disable-line no-await-in-loop
    const cr = await como('S').post('/api/requisicoes-material', {
      setor, urgencia: 'NORMAL', os_referencia: os, itens: ms.map((m, i) => ({ material_id: m, quantidade: qs[i] })),
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const R = cr.body.id;
    const itens = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [R])).map((r) => r.id);
    const ap = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(ap.status, 200, `aprovar: ${JSON.stringify(ap.body)}`);
    for (let i = 0; i < ms.length; i++) { // eslint-disable-line no-await-in-loop
      const en = await como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: ms[i], tipo: 'ENTRADA', quantidade: qs[i], motivo: 'e182' }); // eslint-disable-line no-await-in-loop
      assert.strictEqual(en.status, 201, `entrada: ${JSON.stringify(en.body)}`);
    }
    const quanto = sep || qs;
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, {
      itens_separados: itens.map((item_id, i) => ({ item_id, quantidade_separada: quanto[i] })).filter((x) => x.quantidade_separada > 0),
    });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
    const l = await como('ALMOX').put(`${API}/requisicoes/${R}/liberar-retirada`, {});
    assert.strictEqual(l.status, 200, `liberar: ${JSON.stringify(l.body)}`);
    const numero = (await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id=?', [R])).numero;
    return { R, itens, numero };
  };
  /** Envelhece a liberacao: `segundos` antes de agora (valor distinto a cada chamada — I2). */
  const envelhecer = (R, segundos) => dbRun(db,
    "UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = datetime('now', ?) WHERE id = ?", [`-${segundos} seconds`, R]);
  const H = 3600; const D = 86400;
  const cartao = async () => {
    const { alertas } = await alertRegistry.montarCentral(db);
    const c = alertas.find((a) => a.chave === EVENTO);
    assert.ok(c, `a central nao trouxe o cartao ${EVENTO}`);
    assert.strictEqual(c.erro, undefined, `o listar lancou: ${JSON.stringify(c)}`);
    return c;
  };
  const noCartao = async (R) => (await cartao()).linhas.some((l) => l.id === R);
  const chaveDe = async (R) => {
    const em = (await dbGet(db, 'SELECT pronta_para_retirada_em AS em FROM requisicoes_almoxarifado WHERE id=?', [R])).em;
    return `retirada-parada-${R}-${em}`;
  };
  const fila = async (R) => dbAll(db, 'SELECT * FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?', [hash(await chaveDe(R))]);

  // ── RN-182.04/.06: a entrada e a config ─────────────────────────────────────────────────────────────────────────
  await test('[182 RN-04] a 16a entrada, no FIM do registro, com titulo, descricao, janela e listar', async () => {
    const reg = alertRegistry.ALERT_REGISTRY;
    // Etapa 182 (T2): 15 -> 16 — SEPARADO_AGUARDANDO_RETIRADA, no fim.
    assert.strictEqual(reg.length, 16, `o registro tem ${reg.length}`);
    const e = reg[15];
    assert.strictEqual(e.chave, EVENTO);
    assert.strictEqual(e.titulo, 'Separado aguardando retirada');
    assert.strictEqual(e.descricao, 'Requisições liberadas para retirada há mais dias que o configurado e ainda não retiradas.');
    assert.deepStrictEqual(e.configDias, { chave: CONFIG, default: 3 });
    assert.strictEqual(typeof e.listar, 'function');
    assert.strictEqual(typeof alertRegistry.listarSeparadoAguardandoRetirada, 'function', 'a regua exportada');
  });

  await test('[182 RN-06] a janela esta SEMEADA com 3 e o cartao vem com dias 3', async () => {
    const s = await dbGet(db, 'SELECT valor, descricao FROM configuracoes_almoxarifado WHERE chave = ?', [CONFIG]);
    assert.ok(s, `${CONFIG} nao semeada`);
    assert.deepStrictEqual([s.valor, s.descricao],
      ['3', 'Dias com a requisicao liberada para retirada (caixa separada parada) para alertar']);
    assert.strictEqual((await cartao()).dias, 3);
  });

  await test('[182 RN-06] PUT /configuracoes: "0" -> 400 literal; "5" -> 200', async () => {
    const r0 = await como('ADMIN').put(`${API}/configuracoes`, { [CONFIG]: '0' });
    assert.deepStrictEqual([r0.status, r0.body.error],
      [400, `Configuração "${CONFIG}" deve ser um número de dias maior que zero`]);
    assert.strictEqual((await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave=?', [CONFIG])).valor, '3');
    const r5 = await como('ADMIN').put(`${API}/configuracoes`, { [CONFIG]: '5' });
    assert.strictEqual(r5.status, 200, JSON.stringify(r5.body));
    await setConfig(CONFIG, '3');
  });

  // ── RN-182.04: a regua ────────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-04] 3 d 1 h entra, 2 d 23 h nao; a linha tem as colunas nomeadas; config 5 tira a de 3 d', async () => {
    const a = await pronta(); const b = await pronta();
    await envelhecer(a.R, 3 * D + H); await envelhecer(b.R, 2 * D + 23 * H);
    const c = await cartao();
    const la = c.linhas.find((l) => l.id === a.R);
    assert.ok(la, '3 d 1 h tinha de estar no cartao');
    assert.ok(!c.linhas.some((l) => l.id === b.R), '2 d 23 h nao podia estar no cartao');
    assert.deepStrictEqual(Object.keys(la).sort(), ['dias_aguardando', 'id', 'itens_na_caixa', 'numero', 'os_referencia',
      'pronta_para_retirada_em', 'setor', 'solicitante_nome', 'status'].sort());
    assert.deepStrictEqual([la.numero, la.solicitante_nome, la.setor, la.os_referencia, la.status, la.dias_aguardando, la.itens_na_caixa],
      [a.numero, USERS.S.nome, 'Comercial', 'OS-182', 'PRONTA_PARA_RETIRADA', 3, 1]);
    await setConfig(CONFIG, '5');
    try {
      assert.ok(!(await noCartao(a.R)), 'com 5 dias a de 3 d 1 h sai');
      assert.strictEqual((await cartao()).dias, 5);
    } finally { await setConfig(CONFIG, '3'); }
    assert.ok(await noCartao(a.R));
  });

  await test('[182 RN-04] itens_na_caixa conta so os itens com caixa (separado - entregue > 0); ordem pela liberacao', async () => {
    const x = await pronta({ qs: [2, 3, 5], sep: [2, 0, 1] });
    await envelhecer(x.R, 40 * D + 7);
    const c = await cartao();
    const lx = c.linhas.find((l) => l.id === x.R);
    assert.ok(lx, 'no cartao');
    assert.strictEqual(lx.itens_na_caixa, 2);
    assert.strictEqual(lx.dias_aguardando, 40);
    assert.strictEqual(c.linhas[0].id, x.R, 'a mais antiga primeiro');
  });

  // ── RN-182.04: as saidas ──────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-04] B504 (devolver da caixa) tira do cartao', async () => {
    const x = await pronta();
    await envelhecer(x.R, 4 * D + 11);
    assert.ok(await noCartao(x.R), 'premissa: no cartao');
    const d = await como('ALMOX').put(`${API}/requisicoes/${x.R}/devolver-separado`, { motivo: 'quebrou', itens: [{ item_id: x.itens[0], quantidade: 1 }] });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.ok(!(await noCartao(x.R)));
  });

  await test('[182 RN-04] entrega parcial (PARCIALMENTE_ATENDIDA) e entrega total tiram do cartao', async () => {
    const p = await pronta(); const t = await pronta();
    await envelhecer(p.R, 4 * D + 13); await envelhecer(t.R, 4 * D + 17);
    assert.ok(await noCartao(p.R) && await noCartao(t.R), 'premissa: as duas no cartao');
    const ep = await como('ALMOX').put(`${API}/requisicoes/${p.R}/entregar`, { itens_atendidos: [{ item_id: p.itens[0], quantidade_atendida: 1 }] });
    assert.strictEqual(ep.status, 200, JSON.stringify(ep.body));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [p.R])).status, 'PARCIALMENTE_ATENDIDA');
    const et = await como('ALMOX').put(`${API}/requisicoes/${t.R}/entregar`, { itens_atendidos: [{ item_id: t.itens[0], quantidade_atendida: 4 }] });
    assert.strictEqual(et.status, 200, JSON.stringify(et.body));
    assert.ok(!(await noCartao(p.R)), 'parcial saiu');
    assert.ok(!(await noCartao(t.R)), 'total saiu');
  });

  await test('[182 RN-04] ativo = 0 tira do cartao; coluna NULL nao entra', async () => {
    const x = await pronta(); const n = await pronta();
    await envelhecer(x.R, 4 * D + 19); await envelhecer(n.R, 4 * D + 23);
    assert.ok(await noCartao(x.R) && await noCartao(n.R), 'premissa');
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 0 WHERE id = ?', [x.R]);
    // coluna NULL com created_at e updated_at ANTIGOS: nenhuma outra data pode servir de regua (sem fallback na leitura)
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = NULL, created_at = '2020-01-01 00:00:00', updated_at = '2020-01-01 00:00:00' WHERE id = ?", [n.R]);
    assert.ok(!(await noCartao(x.R)), 'ativo 0 saiu');
    assert.ok(!(await noCartao(n.R)), 'coluna NULL nao entra');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id=?', [n.R])).status, 'PRONTA_PARA_RETIRADA');
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 1 WHERE id = ?', [x.R]);
    assert.ok(await noCartao(x.R), 'controle: com ativo 1 ela volta (o filtro e o ativo, nao outra coisa)');
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = NULL WHERE id = ?', [x.R]);
    assert.ok(await noCartao(x.R), 'ativo NULL conta como ativa (COALESCE)');
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 0 WHERE id = ?', [x.R]);
  });

  // ── RN-182.05/.07: dedupe e textos ────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-05] varrer 2x -> 1 enfileirada + a 2a duplicada; B504 + reliberar + envelhecer -> a 2a enfileirada', async () => {
    const x = await pronta();
    await envelhecer(x.R, 5 * D + 29);
    const k1 = await chaveDe(x.R);
    await queueService.varrerAlertasRegistrados(db);
    assert.strictEqual((await fila(x.R)).length, 1, 'a primeira varredura enfileira');
    const r2 = await queueService.varrerAlertasRegistrados(db);
    const minha = r2.find((r) => r.chave === EVENTO);
    assert.ok(minha && minha.duplicadas >= 1 && !minha.erro, JSON.stringify(minha));
    assert.strictEqual((await fila(x.R)).length, 1, 'a segunda e DUPLICADA');
    const f1 = (await fila(x.R))[0];
    // a fila guarda so o hash (evento|chave) — a chave e medida pelo hash escrito a mao acima
    assert.deepStrictEqual([f1.evento, f1.hash_dedupe, JSON.parse(f1.payload)], [EVENTO, hash(k1), { requisicao_id: x.R }]);
    const d = await como('ALMOX').put(`${API}/requisicoes/${x.R}/devolver-separado`, { motivo: 'conferir', itens: [{ item_id: x.itens[0], quantidade: 1 }] });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.strictEqual((await como('ALMOX').put(`${API}/requisicoes/${x.R}/liberar-retirada`, {})).status, 200);
    await envelhecer(x.R, 4 * D + 31);
    const k2 = await chaveDe(x.R);
    assert.notStrictEqual(k2, k1, 'premissa: a liberacao nova tem outro instante');
    await queueService.varrerAlertasRegistrados(db);
    const h1 = (await dbAll(db, 'SELECT id FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?', [hash(k1)])).length;
    const h2 = (await dbAll(db, 'SELECT id FROM fila_notificacoes_almoxarifado WHERE hash_dedupe = ?', [hash(k2)])).length;
    assert.deepStrictEqual([h1, h2], [1, 1], 'um aviso por liberacao: a reliberacao enfileira a 2a');
  });

  await test('[182 RN-07] assunto e corpo literais; a liberacao em UTC vira hora de Brasilia', async () => {
    const x = await pronta({ qs: [3, 2], setor: 'Usinagem', os: 'OS-777' });
    await dbRun(db, "UPDATE requisicoes_almoxarifado SET pronta_para_retirada_em = '2026-10-19 01:30:00' WHERE id = ?", [x.R]);
    const linha = (await alertRegistry.listarSeparadoAguardandoRetirada(db, { dias: 0.0001 })).find((l) => l.id === x.R);
    assert.ok(linha, 'na regua');
    const dias = Number((await dbGet(db, "SELECT CAST(julianday('now') - julianday('2026-10-19 01:30:00') AS INTEGER) AS d")).d);
    const e = alertRegistry.ALERT_REGISTRY.find((a) => a.chave === EVENTO);
    assert.strictEqual(e.assunto(linha), `[Almoxarifado] Separado aguardando retirada — ${x.numero}`);
    assert.strictEqual(e.corpo(linha), [
      `Requisição: ${x.numero}`,
      `Solicitante: ${USERS.S.nome}`,
      'Setor: Usinagem',
      'OS: OS-777',
      'Itens na caixa: 2',
      'Liberada para retirada em: 2026-10-18 22:30:00',
      `Aguardando há: ${dias} dia(s)`,
    ].join('\n'));
    assert.strictEqual(e.dedupeChave(linha), `retirada-parada-${x.R}-2026-10-19 01:30:00`);
    assert.deepStrictEqual(e.payload(linha), { requisicao_id: x.R });
    // sem setor e sem OS: travessao
    assert.ok(/^Setor: -$/m.test(e.corpo({ ...linha, setor: null })) && /^OS: -$/m.test(e.corpo({ ...linha, os_referencia: '' })));
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET ativo = 0 WHERE id = ?', [x.R]); // nao polui os seguintes
  });

  // ── RN-182.08: a central ──────────────────────────────────────────────────────────────────────────────────────
  await test('[182 RN-08] GET /alertas/central: 16 cartoes, o novo na posicao 16; PRODUCAO -> 403', async () => {
    const r = await como('ADMIN').get(`${API}/alertas/central`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // Etapa 182 (T2): 15 -> 16.
    assert.strictEqual(r.body.alertas.length, 16);
    const c = r.body.alertas[15];
    assert.deepStrictEqual([c.chave, c.titulo, c.dias], [EVENTO, 'Separado aguardando retirada', 3]);
    assert.ok(c.total >= 1 && Array.isArray(c.linhas));
    assert.deepStrictEqual(r.body.alertas.filter((a) => a.erro).map((a) => a.chave), []);
    const p = await como('S').get(`${API}/alertas/central`);
    assert.strictEqual(p.status, 403, JSON.stringify(p.body));
  });

  await test('[182 RN-04] erro em outra entrada nao derruba esta (central parcial honesta)', async () => {
    const e = alertRegistry.ALERT_REGISTRY.find((a) => a.chave === EVENTO);
    const quebrada = { chave: 'X', titulo: 'X', listar: async () => { throw new Error('boom'); } };
    const origErr = console.error; console.error = () => {};
    let r;
    try { r = await alertRegistry.montarCentral(db, [quebrada, e]); } finally { console.error = origErr; }
    assert.deepStrictEqual(r.alertas[0], { chave: 'X', titulo: 'X', erro: true, total: 0, linhas: [] });
    assert.strictEqual(r.alertas[1].chave, EVENTO);
    assert.strictEqual(r.alertas[1].erro, undefined);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
