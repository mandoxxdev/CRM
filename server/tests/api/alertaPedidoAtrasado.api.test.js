/**
 * Etapa 39, Task 4 (RN-D09, RN-D10, RN-D11, RN-D13) — a entrada PEDIDO_COMPRA_ATRASADO do
 * registro de alertas.
 *
 * ⚠️ TODA assercao filtra a fila por `evento`, NUNCA por total global (nota de cabecalho de
 * alertaRegistro.api.test.js:6-8): materiais/ferramentas semeados sem movimentacao caem
 * AUTOMATICAMENTE em outros alertas do registro, e um contador global mediria o alerta errado.
 *
 * ⚠️ NENHUMA DATA LITERAL. Todas derivam de `hojeLocalISO()`, a MESMA funcao que a rota e a
 * entrada usam — um fixture '2026-09-15' escrito a mao e atrasado hoje e nao e amanha (R3).
 *
 * ⚠️ PRIMEIRA entrada do registro que le tabelas CORE (`pedidos_compra`, `fornecedores`): as 11
 * anteriores so leem `*_almoxarifado`. Mesmo handle, mesmo arquivo SQLite — decisao de
 * arquitetura declarada na letra B do doc de novidades.
 *
 * Executar: cd server && node tests/api/alertaPedidoAtrasado.api.test.js
 */
const assert = require('assert');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const { hojeLocalISO } = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 71, nome: 'Admin E39 T4', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function hashDedupe(evento, dedupeChave) {
  return crypto.createHash('sha256').update(`${evento}|${dedupeChave}`).digest('hex');
}

// hoje + N dias, em data LOCAL, pela MESMA regua do servidor. Nao usa toISOString (UTC).
function diasDeHoje(n) {
  const [a, m, d] = hojeLocalISO().split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

async function setConfig(db, chave, valor) {
  await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?`, [valor, chave]);
}

async function filaPorEvento(db, evento) {
  return dbAll(db, `SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ? ORDER BY id ASC`, [evento]);
}

function resultadoDe(resultados, chave) {
  const r = resultados.find((x) => x.chave === chave);
  assert.ok(r, `varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
  return r;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  await setConfig(db, 'alertas_estoque_emails', 'compras@gmp.ind.br');
  await setConfig(db, 'alertas_estoque_notificar_email', '1');

  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Acos Vale E39','79.779.779/0001-79')`);

  let seq = 0;
  async function novoPedido({ previsao, status = 'pendente', semFornecedor = false }) {
    seq += 1;
    const numero = `PC-E39T4-${String(seq).padStart(3, '0')}`;
    const p = await dbRun(db, `INSERT INTO pedidos_compra
        (numero, fornecedor_id, previsao_entrega, status) VALUES (?,?,?,?)`,
    [numero, semFornecedor ? null : forn.lastID, previsao, status]);
    return { id: p.lastID, numero, previsao, status };
  }

  const previsaoP1 = diasDeHoje(-1);
  let P1; let P6;

  // ── (1) RN-D09: cinco pedidos, UM alerta ────────────────────────────────────────────────────
  await test('(1) RN-D09 cinco pedidos e UM alerta; o SEXTO, sem fornecedor, tambem entra (LEFT JOIN, R9)', async () => {
    P1 = await novoPedido({ previsao: previsaoP1, status: 'pendente' });
    await novoPedido({ previsao: diasDeHoje(5), status: 'pendente' });        // P2 no prazo
    await novoPedido({ previsao: null, status: 'pendente' });                 // P3 sem previsao
    await novoPedido({ previsao: diasDeHoje(-3), status: 'recebido' });       // P4 fora da regua
    await novoPedido({ previsao: diasDeHoje(-4), status: 'cancelado' });      // P5 fora da regua

    await queueService.varrerAlertasRegistrados(db);
    const fila = await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO');
    assert.strictEqual(fila.length, 1, `esperava 1 alerta, veio ${fila.length}: `
      + JSON.stringify(fila.map((l) => l.assunto)));
    assert.strictEqual(JSON.parse(fila[0].payload).pedido_compra_id, P1.id,
      `o alerta saiu para outro pedido: ${fila[0].payload}`);
    assert.strictEqual(JSON.parse(fila[0].payload).dias_atraso, 1, fila[0].payload);

    // METADE QUE MEDE O DANO: pedido ORFAO de fornecedor tambem atrasa (R9). Um `JOIN` no lugar
    // do `LEFT JOIN` o faria sumir do alerta em silencio.
    // (divergencia declarada do brief: ele escrevia o sexto pedido dentro deste mesmo cenario e
    // mantinha `1` nos cenarios seguintes — com o sexto enfileirado, a fila passa a ter DUAS
    // linhas e (2)/(4)/(5) contam 2. O numero certo e o medido, nao o escrito.)
    P6 = await novoPedido({ previsao: diasDeHoje(-2), status: 'pendente', semFornecedor: true });
    await queueService.varrerAlertasRegistrados(db);
    const fila2 = await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO');
    assert.strictEqual(fila2.length, 2, `pedido sem fornecedor tinha de entrar: veio ${fila2.length} linha(s)`);
    const doOrfao = fila2.find((l) => JSON.parse(l.payload).pedido_compra_id === P6.id);
    assert.ok(doOrfao, 'o pedido sem fornecedor nao gerou alerta (JOIN no lugar de LEFT JOIN?)');
    assert.ok(/^Fornecedor: -$/m.test(doOrfao.corpo_texto),
      `corpo do orfao tinha de trazer 'Fornecedor: -': ${JSON.stringify(doOrfao.corpo_texto)}`);
  });

  // ── (2) RN-D10: a segunda varredura e DUPLICADA ─────────────────────────────────────────────
  await test('(2) RN-D10 segunda varredura nao cresce a fila e o hash de dedupe e pedido-atrasado-<id>', async () => {
    const r = resultadoDe(await queueService.varrerAlertasRegistrados(db), 'PEDIDO_COMPRA_ATRASADO');
    assert.deepStrictEqual({ enfileiradas: r.enfileiradas, duplicadas: r.duplicadas },
      { enfileiradas: 0, duplicadas: 2 }, JSON.stringify(r));
    const fila = await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO');
    assert.strictEqual(fila.length, 2, `2a varredura nao pode duplicar: ${fila.length} linha(s)`);

    const doP1 = fila.find((l) => JSON.parse(l.payload).pedido_compra_id === P1.id);
    assert.strictEqual(doP1.hash_dedupe, hashDedupe('PEDIDO_COMPRA_ATRASADO', `pedido-atrasado-${P1.id}`),
      'dedupe deveria ser pedido-atrasado-<id>');
  });

  // ── (3) RN-D09: assunto e corpo ─────────────────────────────────────────────────────────────
  await test('(3) RN-D09 assunto com prefixo [Compras] e corpo com pedido, fornecedor, previsao, atraso e status', async () => {
    const fila = await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO');
    const doP1 = fila.find((l) => JSON.parse(l.payload).pedido_compra_id === P1.id);
    assert.strictEqual(doP1.assunto, `[Compras] Pedido de compra atrasado — ${P1.numero}`,
      `assunto literal divergiu: ${JSON.stringify(doP1.assunto)}`);
    // O documento e de COMPRAS e a lista de destinatarios e compartilhada — o prefixo e o que
    // deixa o leitor filtrar (D5, descartado (e)).
    assert.ok(!doP1.assunto.includes('[Almoxarifado]'), `prefixo errado: ${doP1.assunto}`);

    const corpo = doP1.corpo_texto;
    for (const linha of [
      `Pedido: ${P1.numero}`,
      'Fornecedor: Acos Vale E39',
      `Previsão de entrega: ${previsaoP1}`,
      'Atraso: 1 dia(s)',
      'Status: pendente',
    ]) {
      assert.ok(corpo.includes(linha), `corpo nao contem ${JSON.stringify(linha)}: ${JSON.stringify(corpo)}`);
    }
  });

  // ── (4) RN-D09: a central monta o cartao ────────────────────────────────────────────────────
  await test('(4) RN-D09 a central tem o cartao novo, sem erro, e as 11 entradas anteriores continuam la', async () => {
    const { alertas } = await alertRegistry.montarCentral(db);
    const cartao = alertas.find((a) => a.chave === 'PEDIDO_COMPRA_ATRASADO');
    assert.ok(cartao, 'a central nao tem o cartao novo');
    // ⚠️ E ESTA a assercao que acusa um `{}` capturado mid-load (R9b): com o require quebrado,
    // `derivarAtraso` vem undefined, o `listar` lanca e o cartao vem `erro: true` — a central NAO
    // quebra (try/catch por entrada, R8), entao sem isto o defeito seria mudo.
    assert.strictEqual(cartao.erro, undefined, `listar lancou: ${cartao.erro_mensagem}`);
    assert.strictEqual(cartao.total, 2, `esperava 2 pedidos atrasados na central, veio ${cartao.total}`);
    assert.strictEqual(cartao.titulo, 'Pedido de compra atrasado');
    assert.strictEqual(cartao.dias, null, 'a entrada nao tem janela de dias (configDias: null)');
    // Metade positiva: a entrada nova nao derrubou nenhuma das 11 anteriores.
    assert.strictEqual(alertas.length, 12, `a central tem ${alertas.length} cartoes`);
  });

  // ── (5) RN-D11: os ids do alerta sao os MESMOS ids de atrasado=1 na rota ────────────────────
  await test('(5) RN-D11 a regua do alerta e a MESMA da tela (inclusive o rejeitado vencido, que fica fora dos dois)', async () => {
    // O `rejeitado` vencido e o que pega a lista de status escrita DUAS vezes: uma segunda regua
    // em SQL (`status NOT IN ('recebido','cancelado')`) o deixaria entrar no alerta e nao na rota.
    await novoPedido({ previsao: diasDeHoje(-6), status: 'rejeitado' });

    const daRota = (await request(app).get('/api/compras/pedidos'))
      .body.filter((p) => p.atrasado === 1).map((p) => p.id).sort((a, b) => a - b);
    const entrada = alertRegistry.ALERT_REGISTRY.find((e) => e.chave === 'PEDIDO_COMPRA_ATRASADO');
    assert.ok(entrada, 'ALERT_REGISTRY nao tem PEDIDO_COMPRA_ATRASADO');
    const doAlerta = (await entrada.listar(db, { dias: null })).map((l) => l.id).sort((a, b) => a - b);

    assert.deepStrictEqual(doAlerta, daRota, 'a regua do alerta divergiu da regua da tela');
    // Metade positiva: os dois conjuntos nao estao vazios (dois conjuntos vazios sao iguais).
    assert.deepStrictEqual(daRota, [P1.id, P6.id].sort((a, b) => a - b),
      `a rota deveria acusar exatamente P1 e P6 atrasados, veio ${JSON.stringify(daRota)}`);
  });

  // ── (6) RN-D09: e-mail desligado ────────────────────────────────────────────────────────────
  await test('(6) RN-D09 com o toggle mestre desligado nao sai alerta, e o motivo e declarado; religando, volta', async () => {
    await setConfig(db, 'alertas_estoque_notificar_email', 'false');
    const antes = (await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO')).length;
    const desligado = resultadoDe(await queueService.varrerAlertasRegistrados(db), 'PEDIDO_COMPRA_ATRASADO');
    assert.strictEqual(desligado.motivo, 'email desligado', JSON.stringify(desligado));
    assert.strictEqual((await filaPorEvento(db, 'PEDIDO_COMPRA_ATRASADO')).length, antes,
      'com e-mail desligado a fila nao pode crescer');

    // Metade positiva no MESMO test(): religar devolve a entrada ao resultado — e ela vem
    // DUPLICADA, porque os dois pedidos ja foram avisados (RN-D10 de novo).
    await setConfig(db, 'alertas_estoque_notificar_email', '1');
    const religado = resultadoDe(await queueService.varrerAlertasRegistrados(db), 'PEDIDO_COMPRA_ATRASADO');
    assert.strictEqual(religado.motivo, undefined, JSON.stringify(religado));
    assert.deepStrictEqual({ enfileiradas: religado.enfileiradas, duplicadas: religado.duplicadas },
      { enfileiradas: 0, duplicadas: 2 }, JSON.stringify(religado));
  });

  // ── (7) RN-D13: o gerador roda no Job B, SEM usuario ────────────────────────────────────────
  await test('(7) RN-D13 o listar da entrada e chamado sem req e sem user — o Job B nao tem nenhum dos dois', async () => {
    const entrada = alertRegistry.ALERT_REGISTRY.find((e) => e.chave === 'PEDIDO_COMPRA_ATRASADO');
    const linhas = await entrada.listar(db, { dias: null });
    assert.ok(Array.isArray(linhas), 'listar tem de devolver array');
    // Metade positiva: chamado sem req ele continua acusando os dois atrasados.
    assert.strictEqual(linhas.length, 2, `esperava 2 linhas, veio ${linhas.length}`);
  });

  // ── (8) R9b: controle de ciclo, processo FRIO ───────────────────────────────────────────────
  await test('(8) R9b o alertRegistry carrega de um processo FRIO e traz a entrada nova', async () => {
    // Processo NOVO, cache de modulos vazio, e o alertRegistry como PRIMEIRO require: e a ordem
    // de carga que um require de topo da regua tornaria arriscada. `{}` mid-load nao lanca — ele
    // devolve um objeto vazio, e o modo de falha e silencioso.
    const { execFileSync } = require('child_process');
    const saida = execFileSync(process.execPath, ['-e', `
      const r = require('./services/almoxarifado/alertRegistry');
      const e = r.ALERT_REGISTRY.find((x) => x.chave === 'PEDIDO_COMPRA_ATRASADO');
      console.log(JSON.stringify({ total: r.ALERT_REGISTRY.length, tem: !!e, listar: typeof (e && e.listar) }));
    `], { cwd: require('path').join(__dirname, '..', '..'), encoding: 'utf8' });
    const medido = JSON.parse(saida.trim().split('\n').pop());
    assert.deepStrictEqual(medido, { total: 12, tem: true, listar: 'function' },
      `carga a frio devolveu ${saida.trim()}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
