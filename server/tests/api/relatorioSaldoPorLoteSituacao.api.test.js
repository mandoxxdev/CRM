/**
 * Etapa 227 (T1) — o *Saldo por lote* diz a situacao do lote (D (225); RN-227.01 a .08) e a Fila de separacao traz o impedido do
 * material (D (223); RN-227.09).
 *
 * `relatorios/saldo-por-lote` devolve `situacao_lote` em toda linha (B1498): as palavras do extrato (`Bloqueado`, `Reprovado`, `Vencido em
 * dd/mm/aaaa`…) quando o lote esta impedido pela regua da aprovacao (`predicadoLoteImpedidoSql`, o "hoje" de Brasilia — B1500), `null` quando
 * pode sair e na linha "Sem lote atribuido". As palavras sao uma copia da funcao do cliente (B1499) — a RN-227.05 roda as duas. O registro
 * declara a coluna *Situacao* logo depois de *Status do lote* (a tela e a planilha seguem o registro). `fila-separacao` ganha `lote_impedido`
 * por item (B1502).
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa227-saldo-por-lote-vencido.md
 *
 * Executar: cd server && node tests/api/relatorioSaldoPorLoteSituacao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { loteImpedidoSql } = require('../../services/almoxarifado/loteImpedido');
const { RELATORIOS } = require('../../services/almoxarifado/reportRegistry');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const USERS = {
  ADMIN: { id: 1, nome: 'Adm 227', role: 'admin', is_superadmin: 1, email: 'a227@t.com' },
  ALMOX: { id: 22722, nome: 'Almox 227', role: 'user', email: 'x227@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
const hojeReal = diaLocal.hojeLocalISO;
const dia = (n) => diaLocal.somarDiasISO(hojeReal(), n);
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const NOTA_FIM = ' Situação = por que o lote não sai para uso (Bloqueado, Reprovado, Vencido em dd/mm/aaaa ou Validade a corrigir, as palavras do extrato do '
  + 'material); vazia quando o lote pode sair (inclusive o vencido com o vencimento liberado).';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

function binaryParser(res, cb) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
}

// RN-227.05: a funcao do cliente, lida do arquivo (ESM) e rodada aqui — o servidor e o cliente nao podem divergir sem este teste cair.
function situacaoDoCliente() {
  const arq = path.join(__dirname, '..', '..', '..', 'client', 'src', 'utils', 'situacaoDoLote.js');
  const fonte = fs.readFileSync(arq, 'utf8');
  assert.ok(/export const situacaoDoLote\s*=/.test(fonte), 'premissa: o cliente exporta situacaoDoLote como const');
  const corpo = fonte.replace(/export const /g, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${corpo}\nreturn situacaoDoLote;`)();
}

(async () => {
  console.log('\n=== Etapa 227: o Saldo por lote diz a situacao do lote; a fila traz o impedido ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    get: (u) => request(app).get(u).set('x-teste-usuario', k).then((x) => x),
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });
  const ok = async (p, st = 200) => { const r = await p; assert.strictEqual(r.status, st, JSON.stringify(r.body)); return r; };

  const alm = await como('ADMIN').post(`${API}/almoxarifados`, { codigo: 'ALM227', nome: 'Almox 227' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await como('ADMIN').post(`${API}/localizacoes`, { codigo: 'Z227-01', descricao: 'Z227-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z227-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E227-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
    return { id, codigo: c };
  };
  const entrar = (m, q, lote) => ok(como('ADMIN').post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q,
    motivo: 'e227', localizacao_destino_id: P01.id, lote }), 201);
  const loteId = async (m, cod) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, cod])).id;
  const status = async (m, cod, st) => ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, cod)}/status`,
    { status: st, justificativa: 'teste 227' }));
  const validade = async (m, cod, data) => dbRun(db, 'UPDATE lotes_almoxarifado SET data_validade = ? WHERE id = ?',
    [data, await loteId(m, cod)]);
  const linhas = async (m) => {
    const r = await ok(como('ADMIN').get(`${API}/relatorios/saldo-por-lote`));
    assert.ok(Array.isArray(r.body), 'saldo-por-lote nao e um array');
    const doMat = r.body.filter((x) => x.material_codigo === m.codigo);
    for (const l of doMat) assert.ok(tem(l, 'situacao_lote'), `linha sem situacao_lote: ${JSON.stringify(l)}`);
    return doMat;
  };
  const situacoes = async (m) => (await linhas(m)).map((l) => [l.lote, l.situacao_lote]);
  const situacao = async (m, cod) => {
    const l = (await linhas(m)).find((x) => x.lote === cod);
    assert.ok(l, `lote ${cod} fora do relatorio`);
    return l.situacao_lote;
  };

  // ── RN-227.01 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let M01;
  await test('[RN-227.01] L1 ATIVO, L2 BLOQUEADO, L3 REPROVADO, L4 ATIVO vencido ontem -> null, Bloqueado, Reprovado, Vencido em <ontem>', async () => {
    M01 = await material();
    await entrar(M01, 4, 'L1'); await entrar(M01, 6, 'L2'); await entrar(M01, 2, 'L3'); await entrar(M01, 3, 'L4');
    await status(M01, 'L2', 'BLOQUEADO'); await status(M01, 'L3', 'REPROVADO'); await validade(M01, 'L4', dia(-1));
    assert.deepStrictEqual(await situacoes(M01),
      [['L1', null], ['L2', 'Bloqueado'], ['L3', 'Reprovado'], ['L4', `Vencido em ${br(dia(-1))}`]]);
  });

  // ── RN-227.02 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.02 a] vencido com o vencimento liberado -> null (C533)', async () => {
    const m = await material(); await entrar(m, 3, 'L4'); await validade(m, 'L4', dia(-1));
    assert.strictEqual(await situacao(m, 'L4'), `Vencido em ${br(dia(-1))}`);
    await ok(como('ADMIN').put(`${API}/lotes/${await loteId(m, 'L4')}/liberar-vencimento`, { justificativa: 'teste 227' }));
    assert.strictEqual(await situacao(m, 'L4'), null);
  });
  await test('[RN-227.02 b] vence hoje -> null; amanha -> null', async () => {
    const m = await material(); await entrar(m, 3, 'LH'); await entrar(m, 3, 'LA');
    await validade(m, 'LH', dia(0)); await validade(m, 'LA', dia(1));
    assert.deepStrictEqual(await situacoes(m), [['LA', null], ['LH', null]]);
  });
  await test('[RN-227.02 c] BLOQUEADO vencido ontem -> "Bloqueado · Vencido em <ontem>"', async () => {
    const m = await material(); await entrar(m, 3, 'L2');
    await status(m, 'L2', 'BLOQUEADO'); await validade(m, 'L2', dia(-1));
    assert.strictEqual(await situacao(m, 'L2'), `Bloqueado · Vencido em ${br(dia(-1))}`);
  });
  await test('[RN-227.02 d] validade gravada como texto -> "Validade a corrigir: 01/03/2027" (Fase 2 I2: 31/03/2027 nao vence pela regua); status estranho -> "Impedido"', async () => {
    const m = await material(); await entrar(m, 3, 'LT'); await entrar(m, 3, 'LQ');
    await validade(m, 'LT', '01/03/2027');
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'QUARENTENA' WHERE id = ?", [await loteId(m, 'LQ')]);
    assert.deepStrictEqual(await situacoes(m), [['LQ', 'Impedido'], ['LT', 'Validade a corrigir: 01/03/2027']]);
  });

  // ── RN-227.03 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.03] a linha "Sem lote atribuído" fica vazia, mesmo depois de um lote impedido; o nunca-teve-lote tambem', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: m.id, tipo: 'AJUSTE', quantidade: 9, motivo: 'inventario', justificativa: 'inventario',
    });
    assert.deepStrictEqual(await situacoes(m), [['L2', 'Bloqueado'], ['Sem lote atribuído', null]]);
    const nunca = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [nunca.id]);
    assert.deepStrictEqual(await situacoes(nunca), [['Sem lote atribuído', null]]);
  });

  // ── RN-227.04 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.04] controle de lote desligado depois: a linha ainda diz "Bloqueado" (como o extrato, B1485)', async () => {
    const m = await material(); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m.id]);
    assert.strictEqual(await situacao(m, 'L2'), 'Bloqueado');
  });

  // ── RN-227.05 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.05] as palavras do servidor sao as do cliente (a mesma tabela nas duas funcoes)', async () => {
    const { situacaoDoLote } = require('../../services/almoxarifado/situacaoDoLote');
    const doCliente = situacaoDoCliente();
    const casos = [
      null, undefined, {},
      { lote_esta_impedido: false, lote_status: 'BLOQUEADO' },
      { lote_esta_impedido: 1, lote_status: 'BLOQUEADO' },
      { lote_esta_impedido: 'true', lote_status: 'BLOQUEADO' },
      { lote_esta_impedido: true, lote_status: 'BLOQUEADO' },
      { lote_esta_impedido: true, lote_status: 'REPROVADO' },
      { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true, lote_validade: '2026-11-10' },
      { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true, lote_validade: '2026-11-10 00:00:00' },
      { lote_esta_impedido: true, lote_status: 'BLOQUEADO', lote_vencido_sem_liberacao: true, lote_validade: '2026-11-10' },
      { lote_esta_impedido: true, lote_status: 'REPROVADO', lote_vencido_sem_liberacao: true, lote_validade: '2026-11-10' },
      { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true, lote_validade: '31/03/2027' },
      { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true, lote_validade: '  ' },
      { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true, lote_validade: null },
      { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: 1, lote_validade: '2026-11-10' },
      { lote_esta_impedido: true, lote_status: 'QUARENTENA' },
      { lote_esta_impedido: true, lote_status: null },
    ];
    let comPalavra = 0;
    for (const c of casos) {
      const s = situacaoDoLote(c);
      assert.strictEqual(s, doCliente(c), `divergiu em ${JSON.stringify(c)}`);
      if (s) comPalavra++;
    }
    assert.ok(comPalavra >= 10, `controle: poucos casos com palavra (${comPalavra})`);
  });

  // ── RN-227.06 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.06] o registro e a lista: Situação logo depois de Status do lote; a nota termina com o literal', async () => {
    const lista = (await ok(como('ADMIN').get(`${API}/relatorios`))).body.relatorios;
    const r = lista.find((x) => x.tipo === 'saldo-por-lote');
    assert.ok(r, 'saldo-por-lote fora da lista');
    const chaves = r.colunas.map((c) => c.chave);
    const i = chaves.indexOf('status_lote');
    assert.ok(i >= 0, `sem status_lote: ${JSON.stringify(chaves)}`);
    assert.deepStrictEqual(r.colunas[i + 1], { chave: 'situacao_lote', rotulo: 'Situação' }, JSON.stringify(chaves));
    assert.strictEqual(r.colunas[i + 2].chave, 'quantidade', JSON.stringify(chaves));
    assert.ok(r.nota.endsWith(NOTA_FIM), r.nota);
    assert.ok(r.nota.includes('Lote + Sem lote atribuído = físico total.'), 'a nota de antes sumiu');
    assert.deepStrictEqual(RELATORIOS['saldo-por-lote'].colunas, r.colunas);
  });
  await test('[RN-227.06] a linha nao traz os campos auxiliares; a planilha tem Situação depois de Status do lote e a celula do L4', async () => {
    for (const l of await linhas(M01)) {
      for (const k of ['lote_esta_impedido', 'lote_vencido_sem_liberacao', 'vencimento_liberado_em', 'lote_vencimento_liberado_em']) {
        assert.ok(!tem(l, k), `a linha trouxe ${k}`);
      }
    }
    const XLSX = require('xlsx');
    const r = await request(app).get(`${API}/relatorios/saldo-por-lote/export`).buffer().parse(binaryParser);
    assert.strictEqual(r.status, 200, `export ${r.status}`);
    const wb = XLSX.read(r.body, { type: 'buffer' });
    const tab = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const cab = tab[0];
    const i = cab.indexOf('Status do lote');
    assert.ok(i >= 0, `sem Status do lote: ${JSON.stringify(cab)}`);
    assert.strictEqual(cab[i + 1], 'Situação', JSON.stringify(cab));
    const iCod = cab.indexOf('Código'); const iLote = cab.indexOf('Lote');
    const doMat = tab.filter((x) => x[iCod] === M01.codigo);
    assert.deepStrictEqual(doMat.map((x) => [x[iLote], x[i + 1] === undefined ? null : x[i + 1]]),
      [['L1', null], ['L2', 'Bloqueado'], ['L3', 'Reprovado'], ['L4', `Vencido em ${br(dia(-1))}`]]);
  });

  // ── RN-227.07 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.07] o "hoje" e o de diaLocal (Brasilia): validade 2026-11-12 vencida em 13/11, nao em 12/11', async () => {
    const m = await material(); await entrar(m, 3, 'LD'); await validade(m, 'LD', '2026-11-12');
    try {
      diaLocal.hojeLocalISO = () => '2026-11-13';
      assert.strictEqual(await situacao(m, 'LD'), 'Vencido em 12/11/2026');
      diaLocal.hojeLocalISO = () => '2026-11-12';
      assert.strictEqual(await situacao(m, 'LD'), null);
    } finally {
      diaLocal.hojeLocalISO = hojeReal;
    }
  });

  // ── RN-227.08 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-227.08] integracao: bloquear e liberar o lote pela rota muda a coluna', async () => {
    const m = await material(); await entrar(m, 6, 'L2');
    assert.strictEqual(await situacao(m, 'L2'), null);
    await status(m, 'L2', 'BLOQUEADO');
    assert.strictEqual(await situacao(m, 'L2'), 'Bloqueado');
    await status(m, 'L2', 'ATIVO');
    assert.strictEqual(await situacao(m, 'L2'), null);
  });

  // ── RN-227.09 ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const reqDireta = async (m, q) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E227-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m.id, q]);
    return R;
  };
  const daFila = async (R) => {
    const fila = (await ok(como('ALMOX').get(`${API}/fila-separacao`))).body;
    const f = fila.find((x) => Number(x.id) === Number(R));
    assert.ok(f, `requisicao ${R} fora da fila`);
    return f.itens[0];
  };
  const regua = async (m) => (await dbGet(db, `SELECT ${loteImpedidoSql('m')} AS v FROM materiais_almoxarifado m WHERE m.id = ?`, [m.id])).v;
  await test('[RN-227.09] a fila traz lote_impedido 6 (a regua do material); sem bloqueio 0; sem controle de lote 0', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const it = await daFila(await reqDireta(m, 5));
    assert.strictEqual(it.disponivel, 10, 'B1374: o disponivel da fila fica');
    assert.strictEqual(it.lote_impedido, 6, JSON.stringify(it));
    assert.strictEqual(it.lote_impedido, await regua(m));
    assert.strictEqual(it.separavel, 4, 'o separavel ja descontava (205)');
    // Fase 2 I1 (C531): o impedido nao desconta o reservado — com reservado 8 o disponivel cai para 2 e o impedido fica 6 (maior que o
    // disponivel; por isso a tela o escreve como um pedaco a parte, nao "disponivel 2 (6 …)").
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 8 WHERE id = ?', [m.id]);
    const res = await daFila(await reqDireta(m, 1));
    assert.deepStrictEqual([res.disponivel, res.lote_impedido], [2, 6]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 0 WHERE id = ?', [m.id]);
    const livre = await material(); await entrar(livre, 4, 'L1');
    assert.strictEqual((await daFila(await reqDireta(livre, 2))).lote_impedido, 0);
    const semCtrl = await material(); await entrar(semCtrl, 6, 'L2'); await status(semCtrl, 'L2', 'BLOQUEADO');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [semCtrl.id]);
    const sc = await daFila(await reqDireta(semCtrl, 2));
    assert.ok(tem(sc, 'lote_impedido'), 'sem o campo');
    assert.strictEqual(sc.lote_impedido, 0);
  });

  // ── Fase 5 (revisao da forca dos testes): as mutacoes que sobreviviam ───────────────────────────────────────────────
  await test('[RN-227.09 b] Fase 5 (M13/M09): a reserva do proprio item nao tira do impedido (6, nao 2); fracionado 2,5 sai 2,5', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await entrar(m, 6, 'L2'); await status(m, 'L2', 'BLOQUEADO');
    const R = await reqDireta(m, 5);
    const item = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [R])).id;
    await dbRun(db, `INSERT INTO reservas_material_almoxarifado (material_id, requisicao_id, item_requisicao_id, quantidade, quantidade_utilizada,
      status, origem) VALUES (?, ?, ?, 4, 0, 'ATIVA', 'REQUISICAO')`, [m.id, R, item]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 4 WHERE id = ?', [m.id]);
    const it = await daFila(R);
    assert.strictEqual(Number(it.disponivel), 10, `premissa: o disponivel da linha soma a reserva do item ${JSON.stringify(it)}`);
    assert.strictEqual(it.lote_impedido, 6, JSON.stringify(it));
    const f = await material(); await entrar(f, 4, 'L1'); await entrar(f, 2.5, 'L2'); await status(f, 'L2', 'BLOQUEADO');
    assert.strictEqual((await daFila(await reqDireta(f, 1))).lote_impedido, 2.5);
  });
  await test('[RN-227.01 b] Fase 5 (M12): lote BLOQUEADO negativo (material que permite saldo negativo) diz "Bloqueado"', async () => {
    const m = await material(); await entrar(m, 4, 'L1'); await entrar(m, 2, 'L2');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [m.id]);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = -2 WHERE material_id = ? AND lote_id = ?', [m.id, await loteId(m, 'L2')]);
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [await loteId(m, 'L2')]);
    const l2 = (await linhas(m)).find((x) => x.lote === 'L2');
    assert.ok(l2, 'o lote negativo sumiu do relatorio');
    assert.ok(Number(l2.quantidade) < 0, `premissa: L2 negativo ${JSON.stringify(l2)}`);
    assert.strictEqual(l2.situacao_lote, 'Bloqueado');
  });
  await test('[RN-227.05 b] Fase 5 (M04): validade com espaco na frente — servidor e cliente iguais', async () => {
    const { situacaoDoLote } = require('../../services/almoxarifado/situacaoDoLote');
    const doCliente = situacaoDoCliente();
    for (const v of [' 2026-11-10', '2026-11-10 ', '\t2026-11-10', '2026-1-10', '20261110']) {
      const c = { lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true, lote_validade: v };
      assert.strictEqual(situacaoDoLote(c), doCliente(c), `divergiu em ${JSON.stringify(c)}`);
    }
    assert.strictEqual(situacaoDoLote({ lote_esta_impedido: true, lote_status: 'ATIVO', lote_vencido_sem_liberacao: true,
      lote_validade: ' 2026-11-10' }), 'Validade a corrigir: 2026-11-10', 'controle: a palavra do espaco na frente');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
