/**
 * Etapa 96 T2 — os outros escritores das colunas de quantidade: terceiros (remessa, retorno, transformacao), inspecao,
 * recebimento, sucateamento e devolucao (C176; contrato "Gravacao" e "Recusa" do plano, literais T1, T2, S1, R2).
 *
 * A T1 deixou o motor (stockService.js) gravando arredondado e recusando com folga. Os servicos em volta dele tem
 * PRE-CHECAGENS em JS e CLAIMS proprios sobre colunas que o motor nao escreve (`quantidade_retornada` do item da
 * remessa, `quantidade_em_inspecao` do item do recebimento, `quantidade_recebida` da linha do pedido) — e eles
 * continuavam com a conta crua: duas linhas de 0,1 + 0,2 de um material com 0,3 recusavam a remessa ("a remessa pede
 * 0.30000000000000004"), dois retornos 0,1 + 0,2 gravavam `quantidade_retornada = 0.30000000000000004`, devolver 0,2
 * de uma saida de 0,3 com 0,1 ja devolvido recusava ("restam 0.19999999999999998").
 *
 * O legado torto e montado por ESCRITOR DIRETO (`UPDATE ... = 0.30000000000000004`), nunca pelo motor (Tecnica 1 do
 * plano). Usuarios reais por header (molde 92-95); ADMIN superadmin age em tudo. Casos `[96 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md
 *
 * Executar: cd server && node tests/api/quantidadeArredondadaServicos.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 96 T2', role: 'admin', is_superadmin: 1, email: 'a96t2@t.com' };
const API = '/api/almoxarifado';
const REM = `${API}/remessas-terceiros`;
const TORTO = 0.9999999999999999; // 0,7 + 0,2 + 0,1
const TORTO03 = 0.30000000000000004; // 0,1 + 0,2
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 96 T2: os outros escritores das colunas de quantidade ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  const post = (u, b = {}) => request(app).post(u).send(b).then((x) => x);

  const material = async (fisico = 0, unidade = 'PC') => {
    const c = `E96S-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, material_critico, custo_unitario) VALUES (?, ?, ?, ?, 0, 1, 0, 0.1)`, [c, c, unidade, fisico])).lastID;
  };
  const mov = (m, tipo, quantidade, extra = {}) => post(`${API}/movimentacoes/v2`, {
    material_id: m, tipo, quantidade, motivo: 'e96', justificativa: 'teste da etapa 96 T2', ...extra,
  });
  const entrar = async (m, q) => { const r = await mov(m, 'ENTRADA', q); assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`); };
  const mat = (m) => dbGet(db, `SELECT quantidade_atual, quantidade_reservada, quantidade_bloqueada, quantidade_em_inspecao,
      quantidade_em_terceiros FROM materiais_almoxarifado WHERE id=?`, [m]);
  const criarRemessa = async (linhas) => {
    const r = await post(REM, { fornecedor_nome: 'Terceiro 96', tipo_servico: 'Galvanizacao', itens: linhas });
    assert.strictEqual(r.status, 201, `criar remessa: ${JSON.stringify(r.body)}`);
    const itens = await dbAll(db, 'SELECT id FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ? ORDER BY id', [r.body.id]);
    return { id: r.body.id, numero: r.body.numero, itens: itens.map((i) => i.id) };
  };
  const enviar = (id) => post(`${REM}/${id}/enviar`);
  const retornar = (id, itemId, quantidade) => post(`${REM}/${id}/retornos`, { itens: [{ item_remessa_id: itemId, quantidade }] });
  const item = (id) => dbGet(db, 'SELECT quantidade, quantidade_retornada FROM itens_remessa_terceiro_almoxarifado WHERE id = ?', [id]);
  const statusRem = async (id) => (await dbGet(db, 'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [id])).status;
  const retrato = async (m) => JSON.stringify({
    m: await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id=?', [m]),
    v: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id=?', [m])).n,
    i: await dbAll(db, 'SELECT id, quantidade_retornada, enviado_em FROM itens_remessa_terceiro_almoxarifado WHERE material_id=? ORDER BY id', [m]),
    s: (await dbGet(db, 'SELECT COUNT(*) n FROM sucateamentos_almoxarifado WHERE material_id=?', [m])).n,
    d: (await dbGet(db, 'SELECT COUNT(*) n FROM devolucoes_material_almoxarifado WHERE material_id=?', [m])).n,
  });
  // Remessa de `q` de um material com `q` de fisico, ja enviada; devolve tudo o que o teste precisa.
  const remessaEnviada = async (q) => {
    const m = await material(0);
    await entrar(m, q);
    const r = await criarRemessa([{ material_id: m, quantidade: q }]);
    const e = await enviar(r.id);
    assert.strictEqual(e.status, 200, `enviar: ${JSON.stringify(e.body)}`);
    assert.strictEqual((await mat(m)).quantidade_em_terceiros, q, 'premissa: o envio reteve');
    return { m, rem: r, itemId: r.itens[0] };
  };
  // O legado: o item ja teve 0,1 + 0,2 retornados pelo codigo antigo — `quantidade_retornada` torta, o material
  // coerente (em terceiros = enviado - 0,3).
  const legadoRetornado = async (q) => {
    const x = await remessaEnviada(q);
    await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET quantidade_retornada = ? WHERE id = ?', [TORTO03, x.itemId]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = ? WHERE id = ?', [Number((q - 0.3).toFixed(6)), x.m]);
    await dbRun(db, "UPDATE remessas_terceiro_almoxarifado SET status = 'RETORNO_PARCIAL' WHERE id = ?", [x.rem.id]);
    assert.strictEqual((await item(x.itemId)).quantidade_retornada, TORTO03, 'premissa: a coluna do item ficou torta');
    return x;
  };

  // ─────────────────────────── terceiros: o item da remessa ───────────────────────────
  await test('[96 RN-01] retornos 0,1 + 0,2 gravam quantidade_retornada 0,3 (nao 0.30000000000000004); o 0,7 seguinte encerra', async () => {
    const { m, rem, itemId } = await remessaEnviada(1);
    for (const q of [0.1, 0.2]) {
      const r = await retornar(rem.id, itemId, q);
      assert.strictEqual(r.status, 200, `retorno ${q}: ${JSON.stringify(r.body)}`);
    }
    assert.strictEqual((await item(itemId)).quantidade_retornada, 0.3);
    const r = await retornar(rem.id, itemId, 0.7);
    assert.strictEqual(r.status, 200, `retorno 0,7: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await item(itemId)).quantidade_retornada, 1);
    assert.strictEqual(await statusRem(rem.id), 'ENCERRADA');
    assert.deepStrictEqual([(await mat(m)).quantidade_atual, (await mat(m)).quantidade_em_terceiros], [1, 0]);
  });
  await test('[96 RN-02] envio: duas linhas 0,1 + 0,2 de um material com 0,3 -> 200 (a soma do pedido nao recusa o que existe)', async () => {
    const m = await material(0);
    await entrar(m, 0.3);
    const r = await criarRemessa([{ material_id: m, quantidade: 0.1 }, { material_id: m, quantidade: 0.2 }]);
    const e = await enviar(r.id);
    assert.strictEqual(e.status, 200, `enviar: ${JSON.stringify(e.body)}`);
    assert.strictEqual((await mat(m)).quantidade_em_terceiros, 0.3);
  });
  await test('[96 RN-02] envio com o fisico legado torto (escrito direto): remessa de 1 -> 200', async () => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    const r = await criarRemessa([{ material_id: m, quantidade: 1 }]);
    const e = await enviar(r.id);
    assert.strictEqual(e.status, 200, `enviar: ${JSON.stringify(e.body)}`);
    assert.strictEqual((await mat(m)).quantidade_em_terceiros, 1);
  });
  await test('[96 RN-02] retorno sobre quantidade_retornada torta (0.30000000000000004 de 0,5): retornar 0,2 -> 200, ENCERRADA', async () => {
    const { m, rem, itemId } = await legadoRetornado(0.5);
    const r = await retornar(rem.id, itemId, 0.2);
    assert.strictEqual(r.status, 200, `retorno 0,2: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await item(itemId)).quantidade_retornada, 0.5);
    assert.strictEqual(await statusRem(rem.id), 'ENCERRADA');
    assert.strictEqual((await mat(m)).quantidade_em_terceiros, 0);
  });
  await test('[96 RN-02] remessa com um item legado ja todo retornado (retornada 0.9999… de 1): retornar o outro item encerra a remessa', async () => {
    const a = await material(0); await entrar(a, 1);
    const b = await material(0); await entrar(b, 1);
    const rem = await criarRemessa([{ material_id: a, quantidade: 1 }, { material_id: b, quantidade: 1 }]);
    assert.strictEqual((await enviar(rem.id)).status, 200);
    // o item A voltou inteiro pelo codigo antigo (0,7 + 0,2 + 0,1): o pendente dele e 1,1e-16, nao 0
    await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET quantidade_retornada = ? WHERE id = ?', [TORTO, rem.itens[0]]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 0 WHERE id = ?', [a]);
    await dbRun(db, "UPDATE remessas_terceiro_almoxarifado SET status = 'RETORNO_PARCIAL' WHERE id = ?", [rem.id]);
    const r = await retornar(rem.id, rem.itens[1], 1);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await statusRem(rem.id), 'ENCERRADA', 'o residuo do legado deixava a remessa em RETORNO_PARCIAL para sempre');
    assert.strictEqual(r.body.pendente_total, 0);
  });
  await test('[96 RN-02] transformacao sobre quantidade_retornada torta: consumir 0,2 -> 200, a chapa baixa 0,2', async () => {
    const { m, rem, itemId } = await legadoRetornado(0.5);
    const peca = await material(0, 'UN');
    const r = await post(`${REM}/${rem.id}/transformacoes`, {
      itens: [{ item_remessa_id: itemId, quantidade_consumida: 0.2, resultados: [{ material_id: peca, quantidade: 2, tipo_resultado: 'PECA' }] }],
    });
    assert.strictEqual(r.status, 200, `transformar: ${JSON.stringify(r.body)}`);
    assert.strictEqual((await item(itemId)).quantidade_retornada, 0.5);
    assert.deepStrictEqual([(await mat(m)).quantidade_atual, (await mat(m)).quantidade_em_terceiros], [0.3, 0]);
    assert.strictEqual((await mat(peca)).quantidade_atual, 2);
  });
  await test('[96 RN-03] envio de 0,200001 com 0,2 -> 400 com a literal T1, nada gravado', async () => {
    const m = await material(0);
    await entrar(m, 0.2);
    const r = await criarRemessa([{ material_id: m, quantidade: 0.200001 }]);
    const antes = await retrato(m);
    const e = await enviar(r.id);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, `Nao foi possivel enviar a remessa ${r.numero}: E96S-${seq}: disponivel 0.2 PC, a remessa pede 0.200001`);
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-03] retorno de 0,200001 com 0,2 no terceiro -> 400, nada gravado', async () => {
    const { m, rem, itemId } = await remessaEnviada(0.2);
    const antes = await retrato(m);
    const r = await retornar(rem.id, itemId, 0.200001);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /^Retorno acima do enviado: /);
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-05] literal T1: duas linhas 0,1 + 0,2 de um material com 0,2 -> "a remessa pede 0.3 em 2 linhas"', async () => {
    const m = await material(0);
    await entrar(m, 0.2);
    const r = await criarRemessa([{ material_id: m, quantidade: 0.1 }, { material_id: m, quantidade: 0.2 }]);
    const e = await enviar(r.id);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, `Nao foi possivel enviar a remessa ${r.numero}: E96S-${seq}: disponivel 0.2 PC, a remessa pede 0.3 em 2 linhas`);
  });
  await test('[96 RN-05] literal T2: retorno acima do pendente com a coluna torta diz 0.3 e 0.2, nao 0.30000000000000004', async () => {
    const { rem, itemId } = await legadoRetornado(0.5);
    const r = await retornar(rem.id, itemId, 0.3);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Retorno acima do enviado: o item E96S-${seq} enviou 0.5 PC, ja retornaram 0.3 e ainda estao no `
      + 'terceiro 0.2 — este recebimento pede 0.3');
  });

  // ─────────────────────────── inspecao: o item do recebimento ───────────────────────────
  await test('[96 RN-02] inspecao de um item com quantidade_em_inspecao torta (escrita direta): aprovar 1 -> 201, o item e o material zeram', async () => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1, quantidade_em_inspecao = ? WHERE id = ?', [TORTO, m]);
    const rec = (await dbRun(db, 'INSERT INTO recebimentos_material_almoxarifado (numero, nota_fiscal) VALUES (?, ?)', [`REC-E96-${seq}`, `NF-E96-${seq}`])).lastID;
    const it = (await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada,
        quantidade_recebida, quantidade_em_inspecao) VALUES (?, ?, 1, 1, ?)`, [rec, m, TORTO])).lastID;
    const r = await post(`${API}/recebimentos/itens/${it}/inspecionar`, { quantidade_aprovada: 1, quantidade_reprovada: 0 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const i = await dbGet(db, 'SELECT quantidade_em_inspecao q FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [it]);
    assert.strictEqual(i.q, 0);
    assert.deepStrictEqual([(await mat(m)).quantidade_em_inspecao, (await mat(m)).quantidade_atual], [0, 1]);
    const d = await dbGet(db, "SELECT quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DECISAO_INSPECAO'", [m]);
    assert.strictEqual(d.quantidade, 1, 'o livro diz o retido arredondado');
  });

  // ─────────────────────────── sucateamento ───────────────────────────
  const sucatear = (m, quantidade) => post(`${API}/sucateamentos`, { material_id: m, quantidade, justificativa: 'teste da etapa 96 T2' });
  await test('[96 RN-04] sucatear 0,3000004 com 0,3 -> 201 e a solicitacao guarda 0,3 (a porta arredonda)', async () => {
    const m = await material(0); await entrar(m, 0.3);
    const r = await sucatear(m, 0.3000004);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const s = await dbGet(db, 'SELECT quantidade FROM sucateamentos_almoxarifado WHERE material_id = ?', [m]);
    assert.strictEqual(s.quantidade, 0.3);
  });
  await test('[96 RN-02] sucatear 1 com o fisico legado torto -> 201', async () => {
    const m = await material(0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ? WHERE id = ?', [TORTO, m]);
    const r = await sucatear(m, 1);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });
  await test('[96 RN-03] sucatear 0,300001 com 0,3 -> 400 com a literal S1 e o numero arredondado, nada gravado', async () => {
    const m = await material(0); await entrar(m, 0.3);
    const antes = await retrato(m);
    const r = await sucatear(m, 0.300001);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Saldo disponivel insuficiente para sucatear E96S-${seq}: disponivel 0.3 PC, solicitado 0.300001. `
      + 'O disponivel ja desconta reservado, bloqueado, em inspecao e em poder de terceiros — sucatear alem dele apagaria '
      + 'material que esta comprometido com outra OS.');
    assert.strictEqual(await retrato(m), antes);
  });

  // ─────────────────────────── devolucao (Fase 2, I1) ───────────────────────────
  const devolver = (m, quantidade, saidaId) => post(`${API}/devolucoes`, {
    material_id: m, quantidade, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId,
  });
  const saidaDe = async (q) => {
    const m = await material(0); await entrar(m, 1);
    const s = await mov(m, 'SAIDA', q);
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    return { m, saidaId: (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'", [m])).id };
  };
  await test('[96 RN-02] devolucao: saida de 0,3, devolvido 0,1, devolver 0,2 -> 201 (o restante e uma diferenca)', async () => {
    const { m, saidaId } = await saidaDe(0.3);
    const a = await devolver(m, 0.1, saidaId);
    assert.strictEqual(a.status, 201, `devolver 0,1: ${JSON.stringify(a.body)}`);
    const b = await devolver(m, 0.2, saidaId);
    assert.strictEqual(b.status, 201, `devolver 0,2: ${JSON.stringify(b.body)}`);
    assert.strictEqual((await mat(m)).quantidade_atual, 1);
  });
  await test('[96 RN-05] literal R2: devolver 0,3 depois de 0,1 diz "restam 0.2", nao 0.19999999999999998', async () => {
    const { m, saidaId } = await saidaDe(0.3);
    assert.strictEqual((await devolver(m, 0.1, saidaId)).status, 201);
    const antes = await retrato(m);
    const r = await devolver(m, 0.3, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Devolução acima do entregue: a saída ${saidaId} entregou 0.3, já foram devolvidos 0.1 e restam 0.2`);
    assert.strictEqual(await retrato(m), antes);
  });
  await test('[96 RN-03] devolucao de 0,200001 com 0,2 restante -> 400', async () => {
    const { m, saidaId } = await saidaDe(0.2);
    const r = await devolver(m, 0.200001, saidaId);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /^Devolução acima do entregue: /);
  });

  // ─────────────────────────── a varredura do codigo-fonte ───────────────────────────
  await test('[96 RN-01] varredura: nenhuma escrita incremental de quantidade nos servicos da T2 fora de Q.qtdSql (com controle do padrao)', async () => {
    const COL = '(quantidade(?:_atual|_reservada|_bloqueada|_em_inspecao|_em_terceiros|_utilizada|_retornada|_recebida|_entregue|_separada)?)';
    const cru = new RegExp(`\\b${COL}\\s*=\\s*(?:MAX\\(0,\\s*)?(?:COALESCE\\(\\1,\\s*0\\)|\\1)\\s*[+-]\\s*\\?`, 'g');
    const culpados = (texto) => texto.split('\n').map((l, i) => [i + 1, l.trim()])
      .filter(([, l]) => { cru.lastIndex = 0; return cru.test(l) && !/Q\.qtdSql\(/.test(l) && !/^\s*(\*|\/\/)/.test(l); });
    assert.strictEqual(culpados('SET quantidade_retornada = COALESCE(quantidade_retornada,0) + ?').length, 1, 'controle do padrao');
    assert.strictEqual(culpados('SET quantidade_recebida = MAX(0, COALESCE(quantidade_recebida, 0) - ?)').length, 1, 'controle do padrao');
    assert.strictEqual(culpados("SET quantidade_retornada = ${Q.qtdSql('COALESCE(quantidade_retornada,0) + ?')}").length, 0);
    const arquivos = ['inspectionService.js', 'thirdPartyService.js', 'receiptService.js', 'scrapDisposalService.js', 'returnService.js'];
    const achados = {}; let embrulhadas = 0;
    for (const a of arquivos) {
      const fonte = fs.readFileSync(path.join(__dirname, '../../services/almoxarifado', a), 'utf8');
      const c = culpados(fonte);
      if (c.length) achados[a] = c;
      embrulhadas += fonte.split('\n').filter((l) => /Q\.qtdSql\('(?:MAX\(0, )?(?:COALESCE\()?quantidade/.test(l)).length;
    }
    assert.deepStrictEqual(achados, {}, 'escritas cruas');
    // as 10 escritas da T2 (inspecao 2, recebimento 3, terceiros 5) — senao a varredura nao varreu
    assert.ok(embrulhadas >= 10, `so ${embrulhadas} escritas embrulhadas — a varredura esta lendo os arquivos certos?`);
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
