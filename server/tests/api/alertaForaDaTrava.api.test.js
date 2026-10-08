/**
 * Etapa 91 (Fase 5, achado F3) — o alerta de estoque minimo nunca roda DENTRO da secao da trava por
 * material, e o SMTP do alerta tem prazo.
 *
 * O defeito (sonda91f-c-bordas SO=3 e sonda91f-c-smtpfalha): `registrarMovimentacao` aguardava
 * `alertService.verificarAlertaPorMaterialId`, que aguarda `transporter.sendMail`. Desde a Etapa 91 as
 * portas que liberam (nota, inspecao, NC) e as que aprovam (`/aprovar`, `/aprovar-valor`, automatica)
 * chamam o motor DENTRO da trava do material — entao um SMTP lento segurava a fila inteira do material:
 * SMTP de 3 s -> a nota 3048 ms e um `/aprovar` concorrente do mesmo material 3032 ms. Na falha o alerta
 * nao e marcado e cada movimento seguinte tenta o SMTP de novo: 3 aprovacoes do mesmo material com SMTP
 * falhando em 1 s responderam em 1/2/3 s, em fila. E o transporter era criado sem prazo (o padrao do
 * nodemailer espera 2 min pela conexao e 10 min pelo socket).
 *
 * O conserto: (1) o motor, quando roda dentro de uma secao da trava, ADIA o alerta para depois de a trava
 * ser solta (`travaPorMaterial.adiarParaDepoisDaSecao`; a requisicao que segurava a trava ainda o aguarda
 * antes de responder — fora da secao, o alerta continua sincrono como sempre); (2) um alerta de minimo em
 * envio para o material faz o concorrente desistir em vez de mandar o segundo e-mail (o adiamento abriu
 * essa corrida; antes a trava a serializava); (3) prazos explicitos no transporter.
 * Semantica preservada: enviado UMA vez e marcado; na falha nao marca e o proximo movimento tenta de novo.
 *
 * Executar: cd server && node tests/api/alertaForaDaTrava.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const nodemailer = require('nodemailer');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 91f3', role: 'admin', is_superadmin: 1, email: 'a91f3@t.com' },
  GESTOR: { id: 9131, nome: 'Gestor 91f3', perfil_almoxarifado: 'GESTOR', email: 'g91f3@t.com' },
  SOL: { id: 9132, nome: 'Solicitante 91f3', email: 's91f3@t.com' }, // sem perfil: fallback PRODUCAO
  ALMOX: { id: 9133, nome: 'Almox 91f3', perfil_almoxarifado: 'ALMOXARIFE', email: 'x91f3@t.com' },
};
const API = '/api/almoxarifado';
let seq = 0;

function comPrazo(p, ms, rotulo) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${rotulo} não respondeu em ${ms / 1000} s — trava presa?`)), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
function estadoEm(p, ms) {
  let t;
  const pend = new Promise((r) => { t = setTimeout(() => r('pendente'), ms); });
  return Promise.race([p.then(() => 'resolveu', () => 'rejeitou'), pend]).finally(() => clearTimeout(t));
}

(async () => {
  console.log('\n=== Etapa 91 (Fase 5, F3): o alerta de minimo roda fora da trava e o SMTP tem prazo ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  // Usuario por requisicao (tecnica da T1): logo depois do jsonParser, no tick do fakeAuth de cada rota.
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; if (k && USERS[k]) setUser({ ...USERS[k] }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, body = {}) => request(app).post(u).set('x-teste-usuario', k).send(body).then((x) => x),
    put: (u, body = {}) => request(app).put(u).set('x-teste-usuario', k).send(body).then((x) => x),
  });

  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  for (const u of Object.values(USERS)) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('F91F3','91000000000333','ativo')")).lastID;
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0');
  await cfg('liberacao_valor_ativo', '0');
  await cfg('inspecao_material_critico', '0');
  await cfg('alertas_smtp_host', 'smtp.teste91f3');
  await cfg('alertas_smtp_from', 'alertas@t.com');
  await cfg('alertas_estoque_emails', 'compras91f3@t.com');

  // Material de minimo 10 com 0: a nota de 4 o deixa abaixo do minimo -> o alerta sai na ENTRADA_COMPRA.
  const material = async () => {
    const c = `E91F3-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, fornecedor_id, material_critico)
      VALUES (?, ?, 'PC', 0, 10, 1, 1, ?, 0)`, [c, `Mat ${c}`, forn])).lastID;
  };
  const criarNota = async (m, q) => {
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F91F3', '2026-09-01', '2026-09-02', 10)`, [`REC-E91F3-${++seq}`, `NF-E91F3-${seq}`])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`, [rec, m, q, q]);
    return rec;
  };
  const criarReq = async (m, q) => {
    const r = await como('SOL').post(`${API}/requisicoes`, { os_referencia: 'OS-91F3', itens: [{ material_id: m, quantidade: q }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.status, 'PENDENTE', JSON.stringify(r.body));
    return r.body.id;
  };
  const holdDe = async (id) => (await dbAll(db, `SELECT quantidade - COALESCE(quantidade_utilizada,0) s
    FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [id])).reduce((a, x) => a + Number(x.s), 0);
  const estadoAlerta = (m) => dbGet(db, 'SELECT estado_estoque, ultimo_alerta_enviado FROM alertas_estoque_material_almoxarifado WHERE material_id = ?', [m]);
  const historico = (m) => dbAll(db, `SELECT status FROM alertas_estoque_historico_almoxarifado
    WHERE material_id = ? AND canal = 'EMAIL' ORDER BY id`, [m]);

  /**
   * Transporter falso: o PRIMEIRO `sendMail` fica preso num portao que o teste abre (resolvendo ou
   * rejeitando); os seguintes respondem na hora (ou falham, se `falhar`). Registra as opcoes de cada
   * `createTransport`.
   */
  function transporterFalso() {
    const t = { envios: 0, opcoes: [], primeiro: null };
    let abrir; let fechar;
    t.portao = new Promise((res, rej) => { abrir = res; fechar = rej; });
    t.portao.catch(() => {});
    t.abrir = () => abrir();
    t.falhar = (msg) => fechar(new Error(msg));
    let avisarPrimeiro; t.primeiro = new Promise((r) => { avisarPrimeiro = r; });
    t.seguintesFalham = false;
    t.criar = (opts) => {
      t.opcoes.push(opts);
      return {
        sendMail: (mail) => {
          // so o alerta de MINIMO conta (aviso de requisicao/aprovacao usa o mesmo SMTP e responde na hora)
          if (!/Alerta de estoque m.nimo/u.test(String(mail && mail.subject))) return Promise.resolve({ messageId: 'outro' });
          t.envios += 1;
          if (t.envios === 1) { avisarPrimeiro(); return t.portao; }
          return t.seguintesFalham ? Promise.reject(new Error('SMTP fora (seguinte)')) : Promise.resolve({ messageId: `m${t.envios}` });
        },
      };
    };
    return t;
  }

  const origCreate = nodemailer.createTransport;
  // Padrao do arquivo: nenhum e-mail sai de verdade (sem DNS do smtp.teste91f3 nos avisos de requisicao).
  const transporterMudo = () => ({ sendMail: () => Promise.resolve({ messageId: 'mudo' }) });
  nodemailer.createTransport = transporterMudo;

  // ══════════════ F3 (a) SMTP lento: a fila do material nao espera o e-mail ══════════════
  await test('[91 F5-F3 (a)] SMTP lento na nota de material abaixo do minimo: o /aprovar concorrente do mesmo material nao espera o e-mail; o alerta sai UMA vez e fica marcado', async () => {
    const m = await material();
    const R = await criarReq(m, 4);
    const rec = await criarNota(m, 4);
    const t = transporterFalso();
    nodemailer.createTransport = t.criar;
    let pNota; let pApr; let estado; let estadoNota;
    try {
      pNota = como('ALMOX').post(`${API}/recebimentos/${rec}/processar`);
      await comPrazo(t.primeiro, 5000, 'o primeiro sendMail');
      // o e-mail do alerta da nota esta preso: o /aprovar do MESMO material tem de andar mesmo assim
      pApr = como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
      estado = await estadoEm(pApr, 1000);
      // a nota soltou a trava, mas ela mesma ainda aguarda o alerta adiado antes de responder (quem le o
      // estado do alerta logo depois da resposta continua vendo-o — o "dispara e esquece" foi descartado)
      estadoNota = await estadoEm(pNota, 100);
    } finally {
      t.abrir();
    }
    const rNota = await comPrazo(pNota, 5000, 'a nota');
    const rApr = await comPrazo(pApr, 5000, 'o /aprovar');
    nodemailer.createTransport = transporterMudo;
    assert.strictEqual(estado, 'resolveu', 'o /aprovar ficou esperando o SMTP do alerta da nota (alerta dentro da secao da trava)');
    assert.strictEqual(estadoNota, 'pendente', 'a nota respondeu sem aguardar o alerta adiado (dispara e esquece)');
    assert.strictEqual(rNota.status, 200, JSON.stringify(rNota.body));
    assert.strictEqual(rApr.status, 200, JSON.stringify(rApr.body));
    assert.strictEqual(rApr.body.status, 'TOTALMENTE_RESERVADA', JSON.stringify(rApr.body));
    assert.strictEqual(await holdDe(R), 4);
    assert.strictEqual(t.envios, 1, `o alerta de minimo saiu ${t.envios} vezes (o concorrente mandou o segundo e-mail)`);
    const est = await estadoAlerta(m);
    assert.ok(est && est.estado_estoque === 'ABAIXO' && est.ultimo_alerta_enviado, `alerta marcado: ${JSON.stringify(est)}`);
    assert.deepStrictEqual((await historico(m)).map((x) => x.status), ['ENVIADO']);
    assert.strictEqual(trava.travado(m), false);
  });

  // ══════════════ F3 (b) SMTP que falha: nada espera, nada marca, o proximo tenta de novo ══════════════
  await test('[91 F5-F3 (b)] SMTP que falha devagar: o /aprovar nao espera; o alerta NAO e marcado (historico ERRO) e o proximo movimento tenta de novo', async () => {
    const m = await material();
    const R = await criarReq(m, 4);
    const rec = await criarNota(m, 4);
    const t = transporterFalso();
    t.seguintesFalham = true;
    nodemailer.createTransport = t.criar;
    let pNota; let pApr; let estado;
    try {
      pNota = como('ALMOX').post(`${API}/recebimentos/${rec}/processar`);
      await comPrazo(t.primeiro, 5000, 'o primeiro sendMail');
      pApr = como('GESTOR').put(`${API}/requisicoes/${R}/aprovar`);
      estado = await estadoEm(pApr, 1000);
    } finally {
      t.falhar('ETIMEDOUT teste');
    }
    const rNota = await comPrazo(pNota, 5000, 'a nota');
    const rApr = await comPrazo(pApr, 5000, 'o /aprovar');
    assert.strictEqual(estado, 'resolveu', 'o /aprovar ficou esperando o SMTP que falhava');
    assert.strictEqual(rNota.status, 200, JSON.stringify(rNota.body));
    assert.strictEqual(rApr.status, 200, JSON.stringify(rApr.body));
    assert.strictEqual(t.envios, 1, `envios durante a falha: ${t.envios}`);
    const est = await estadoAlerta(m);
    assert.ok(!est || est.estado_estoque !== 'ABAIXO', `falha nao marca: ${JSON.stringify(est)}`);
    assert.deepStrictEqual((await historico(m)).map((x) => x.status), ['ERRO']);

    // o proximo movimento (fora de secao: uma SAIDA avulsa pela v2) tenta de novo — agora o SMTP responde
    t.seguintesFalham = false;
    const rs = await como('ALMOX').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: 1, motivo: 'Ajuste', justificativa: 'F3 nova tentativa' });
    nodemailer.createTransport = transporterMudo;
    assert.strictEqual(rs.status, 201, JSON.stringify(rs.body));
    assert.strictEqual(t.envios, 2, 'o movimento seguinte tentou o SMTP de novo');
    const est2 = await estadoAlerta(m);
    assert.ok(est2 && est2.estado_estoque === 'ABAIXO' && est2.ultimo_alerta_enviado, `marcado depois do envio: ${JSON.stringify(est2)}`);
    assert.deepStrictEqual((await historico(m)).map((x) => x.status), ['ERRO', 'ENVIADO']);
  });

  // ══════════════ F3 (c) prazos do transporter ══════════════
  await test('[91 F5-F3 (c)] o transporter do alerta nasce com prazos explicitos (conexao, saudacao, socket) abaixo dos 30 s do cliente', async () => {
    const m = await material();
    const t = transporterFalso();
    t.abrir();
    nodemailer.createTransport = t.criar;
    let r;
    try {
      r = await como('ALMOX').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: 2, motivo: 'Ajuste', justificativa: 'F3 prazos' });
    } finally { nodemailer.createTransport = transporterMudo; }
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(t.opcoes.length, 1, `createTransport chamado ${t.opcoes.length} vezes`);
    const o = t.opcoes[0];
    for (const k of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
      assert.ok(Number.isFinite(o[k]) && o[k] > 0 && o[k] <= 30000, `${k} = ${o[k]}`);
    }
  });

  // ══════════════ F3 (d) fora de secao, nada muda ══════════════
  await test('[91 F5-F3 (d)] fora de uma secao da trava o alerta continua sincrono: a v2 so responde depois do envio', async () => {
    const m = await material();
    const t = transporterFalso();
    nodemailer.createTransport = t.criar;
    let p; let estado;
    try {
      p = como('ALMOX').post(`${API}/movimentacoes/v2`, { material_id: m, tipo: 'ENTRADA', quantidade: 2, motivo: 'Ajuste', justificativa: 'F3 sincrono' });
      await comPrazo(t.primeiro, 5000, 'o primeiro sendMail');
      estado = await estadoEm(p, 200);
    } finally { t.abrir(); }
    const r = await comPrazo(p, 5000, 'a v2');
    nodemailer.createTransport = transporterMudo;
    assert.strictEqual(estado, 'pendente', 'a v2 respondeu antes do e-mail: o alerta deixou de ser sincrono fora da trava');
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual((await historico(m)).map((x) => x.status), ['ENVIADO']);
  });

  nodemailer.createTransport = origCreate;
  console.log(`\n${passed} passed, ${failed} failed`);
  await close();
  process.exit(failed ? 1 : 0);
})();
