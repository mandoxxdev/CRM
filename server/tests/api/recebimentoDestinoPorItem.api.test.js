/**
 * Etapa 57 — o destino (endereço) escolhido POR ITEM ao processar o recebimento, e a devolução ao
 * fornecedor saindo do endereço onde a peça entrou.
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa57-destino-no-recebimento.md
 *
 * Executar: cd server && node tests/api/recebimentoDestinoPorItem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 5701, nome: 'Admin E57', role: 'admin', is_superadmin: 1, email: 'admin57@test.com' };
const QUALIDADE = { id: 5702, nome: 'Qualidade E57', role: 'usuario', perfil_almoxarifado: 'QUALIDADE' };
const COMPRAS = { id: 5703, nome: 'Compras E57', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 57: destino por item no recebimento ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  const loc = async (nome, extra = {}) => {
    const c = `E57-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo, bloqueada) VALUES (?,?,?,?)',
      [c, nome, extra.ativo ?? 1, extra.bloqueada || 0])).lastID, codigo: c };
  };
  const material = async (extra = {}) => {
    const c = `E57-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, localizacao_padrao_id, material_critico, controle_lote)
        VALUES (?, 'Mat', 'UN', 0, 1, ?, ?, 0)`, [c, extra.padrao || null, extra.critico ? 1 : 0])).lastID, codigo: c };
  };
  /** Nota pronta para processar (EM_ENTRADA_NF, dados fiscais) com os itens dados. */
  const nota = async (itens) => {
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme', '2026-09-01', '2026-09-02', 100)`, [`REC-E57-${++seq}`, `NF-E57-${seq}`])).lastID;
    const ids = [];
    for (const it of itens) {
      ids.push((await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
        (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec, it.material, it.esperada ?? it.qtd, it.recebida ?? it.qtd])).lastID);
    }
    return { rec, ids };
  };
  const processar = (rec, body) => request(app).post(`/api/almoxarifado/recebimentos/${rec}/processar`).send(body);
  const saldoEm = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ?`, [m, l])).q);
  const nEntradas = async (m) => (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_COMPRA'", [m])).n;

  await test('RN-01 dois itens, dois destinos; item sem destino cai na padrao (hoje)', async () => {
    const X = await loc('X'); const Y = await loc('Y'); const P = await loc('P');
    const m1 = await material(); const m2 = await material(); const m3 = await material({ padrao: P.id });
    const { rec, ids } = await nota([{ material: m1.id, qtd: 5 }, { material: m2.id, qtd: 7 }, { material: m3.id, qtd: 2 }]);
    const r = await processar(rec, { destinos: [{ item_id: ids[0], localizacao_id: X.id }, { item_id: String(ids[1]), localizacao_id: Y.id }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m1.id, X.id), 5); assert.strictEqual(await saldoEm(m2.id, Y.id), 7);
    assert.strictEqual(await saldoEm(m3.id, P.id), 2);
    assert.strictEqual(await saldoEm(m1.id, Y.id), 0);
  });

  await test('RN-01 destino da nota vale de default; o do item vence', async () => {
    const N = await loc('N'); const X = await loc('NX'); const m1 = await material(); const m2 = await material();
    const { rec, ids } = await nota([{ material: m1.id, qtd: 3 }, { material: m2.id, qtd: 4 }]);
    const r = await processar(rec, { localizacao_id: N.id, destinos: [{ item_id: ids[1], localizacao_id: X.id }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m1.id, N.id), 3); assert.strictEqual(await saldoEm(m2.id, X.id), 4);
  });

  await test('RN-02 um item com destino INATIVO e outro BLOQUEADO: a nota inteira e recusada com a lista, nada entra', async () => {
    const I = await loc('I', { ativo: 0 }); const B = await loc('B', { bloqueada: 1 }); const A = await loc('A');
    const m1 = await material(); const m2 = await material(); const m3 = await material();
    const { rec, ids } = await nota([{ material: m1.id, qtd: 1 }, { material: m2.id, qtd: 1 }, { material: m3.id, qtd: 1 }]);
    const r = await processar(rec, { destinos: [{ item_id: ids[0], localizacao_id: I.id }, { item_id: ids[1], localizacao_id: B.id }, { item_id: ids[2], localizacao_id: A.id }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error,
      `Nao foi possivel dar entrada no estoque: ${m1.codigo}: Localização ${I.codigo} está inativa; ${m2.codigo}: Localização ${B.codigo} está bloqueada`);
    for (const m of [m1, m2, m3]) assert.strictEqual(await nEntradas(m.id), 0);
    // Metade positiva: corrigidos, a mesma nota entra.
    const ok = await processar(rec, { destinos: [{ item_id: ids[0], localizacao_id: A.id }, { item_id: ids[1], localizacao_id: A.id }] });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await saldoEm(m1.id, A.id), 1);
  });

  await test('RN-03 destinos malformados: literais', async () => {
    const A = await loc('V'); const m = await material(); const { rec, ids } = await nota([{ material: m.id, qtd: 1 }]);
    const casos = [
      [{ destinos: 'x' }, 'Destinos inválidos'],
      // Objeto nao e iteravel: sem a checagem de lista viraria TypeError (500). A string acima nao
      // separa as duas checagens (itera os caracteres e cai na seguinte, com a mesma literal).
      [{ destinos: {} }, 'Destinos inválidos'],
      [{ destinos: [null] }, 'Destinos inválidos'],
      [{ destinos: [{ item_id: 999999, localizacao_id: A.id }] }, 'Item 999999 não pertence a este recebimento'],
      [{ destinos: [{ item_id: ids[0], localizacao_id: 'abc' }] }, `Destino inválido para o item ${ids[0]}`],
      [{ destinos: [{ item_id: ids[0], localizacao_id: A.id }, { item_id: ids[0], localizacao_id: A.id }] }, `Item ${ids[0]} repetido nos destinos`],
    ];
    for (const [body, literal] of casos) {
      const r = await processar(rec, body);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, literal);
    }
    assert.strictEqual(await nEntradas(m.id), 0);
    const ok = await processar(rec, { destinos: [] });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  });

  // Etapa 70 (T0): este cenario dizia "recebida=0 usa a esperada" e PRENDIA o defeito — o 0 conferido
  // ("chegou zero") entrava no estoque pela esperada. Agora: recebida NULA (nao conferido) usa a esperada;
  // recebida 0 com esperada 4 NAO entra e o destino dele e ignorado sem validar, como o do item zerado.
  await test('Destino de item que NAO vai entrar e ignorado (sem validar); recebida nula usa a esperada, recebida 0 nao entra', async () => {
    const A = await loc('IG'); const I = await loc('IGI', { ativo: 0 }); const m1 = await material(); const m2 = await material();
    const m3 = await material();
    const { rec, ids } = await nota([{ material: m1.id, qtd: 0, esperada: 0, recebida: 0 }, { material: m2.id, esperada: 6, qtd: null },
      { material: m3.id, esperada: 4, recebida: 0 }]);
    const r = await processar(rec, { destinos: [{ item_id: ids[0], localizacao_id: I.id }, { item_id: ids[1], localizacao_id: A.id },
      { item_id: ids[2], localizacao_id: I.id }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m2.id, A.id), 6);
    assert.strictEqual(await nEntradas(m3.id), 0, 'chegou zero nao entra pela esperada');
  });

  await test('RN-04 o workflow (acao processar) repassa os destinos', async () => {
    const W = await loc('W'); const m = await material(); const { rec, ids } = await nota([{ material: m.id, qtd: 8 }]);
    const r = await request(app).post(`/api/almoxarifado/recebimentos/${rec}/workflow`)
      .send({ acao: 'processar', destinos: [{ item_id: ids[0], localizacao_id: W.id }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, W.id), 8);
  });

  await test('Serie entra no endereco do item (series_almoxarifado.localizacao_id)', async () => {
    const S = await loc('S');
    const m = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
      VALUES (?, 'Serial', 'UN', 0, 1, 1)`, [`E57-SER-${++seq}`])).lastID;
    const { rec, ids } = await nota([{ material: m, qtd: 2 }]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET series = ? WHERE id = ?', [`SN-${seq}-A\nSN-${seq}-B`, ids[0]]);
    const r = await processar(rec, { destinos: [{ item_id: ids[0], localizacao_id: S.id }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const ser = await dbGet(db, 'SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, S.id]);
    assert.strictEqual(ser.n, 2);
  });

  await test('RN-06 devolucao ao fornecedor sai do endereco onde a peca ENTROU, nao da padrao', async () => {
    await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('inspecao_material_critico','1')
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`);
    const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E57','57.570.570/0001-57','ativo')")).lastID;
    const P = await loc('DP'); const X = await loc('DX');
    const m = await material({ padrao: P.id, critico: true });
    // 20 bons na padrão, de antes.
    const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 20, localizacao_destino_id: P.id, motivo: 'e57' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-E57-D-${seq}`, fornecedor_id: forn, fornecedor_nome: 'Forn E57',
      itens: [{ material_id: m.id, quantidade: 10 }],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const item = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [criado.body.id]);
    // /aprovar também passa pela validação (Fase 2, crítico 3) — e grava o destino do item.
    const ap = await request(app).post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({ destinos: [{ item_id: item.id, localizacao_id: X.id }] });
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual(await saldoEm(m.id, X.id), 10);
    setUser({ ...QUALIDADE });
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${item.id}/inspecionar`)
      .send({ quantidade_aprovada: 7, quantidade_reprovada: 3, dano_fisico: 1, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(insp.status, 201, JSON.stringify(insp.body));
    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO&limite=500');
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id && n.referencia_tipo === 'INSPECAO');
    const dec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/decidir`).send({ decisao: 'DEVOLVER', justificativa: 'avariada na chegada' });
    assert.strictEqual(dec.status, 200, JSON.stringify(dec.body));
    setUser({ ...COMPRAS });
    const exec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/executar`).send({ observacoes: 'coleta' });
    assert.strictEqual(exec.status, 200, JSON.stringify(exec.body));
    setUser({ ...ADMIN });
    assert.strictEqual(await saldoEm(m.id, X.id), 7, 'a devolucao nao saiu de onde a peca entrou');
    assert.strictEqual(await saldoEm(m.id, P.id), 20, 'a devolucao tirou peca BOA da padrao');
  });

  // ── Fase 5 ────────────────────────────────────────────────────────────────────────────────
  const fornF5 = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E57 F5','57.570.570/0002-57','ativo')")).lastID;
  /** Recebe `itens` (mesmo material pode repetir) pela rota, aprova com `destinos` por índice. */
  async function receberEAprovar(itens, destinosPorIndice) {
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: `NF-E57-F5-${++seq}`, fornecedor_id: fornF5, fornecedor_nome: 'Forn E57 F5', itens,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const ids = (await dbAll(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id', [criado.body.id])).map((r) => r.id);
    const destinos = destinosPorIndice.map((l, i) => (l ? { item_id: ids[i], localizacao_id: l } : null)).filter(Boolean);
    const ap = await request(app).post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({ destinos });
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    return { rec: criado.body.id, ids };
  }
  async function reprovarEDevolver(itemId, reprovada) {
    setUser({ ...QUALIDADE });
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${itemId}/inspecionar`)
      .send({ quantidade_aprovada: 10 - reprovada, quantidade_reprovada: reprovada, dano_fisico: 1, encaminhamento: 'DEVOLVER' });
    assert.strictEqual(insp.status, 201, JSON.stringify(insp.body));
    const lista = await request(app).get('/api/almoxarifado/nao-conformidades?origem=INSPECAO&limite=500');
    const doc = lista.body.itens.find((n) => n.referencia_id === insp.body.id && n.referencia_tipo === 'INSPECAO');
    const dec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/decidir`).send({ decisao: 'DEVOLVER', justificativa: 'avariada na chegada' });
    assert.strictEqual(dec.status, 200, JSON.stringify(dec.body));
    setUser({ ...COMPRAS });
    const exec = await request(app).post(`/api/almoxarifado/nao-conformidades/${doc.id}/executar`).send({ observacoes: 'coleta' });
    setUser({ ...ADMIN });
    return exec;
  }

  await test('Fase 5: MESMO material duas vezes na nota, em X e Y — reprovar o item de X devolve de X', async () => {
    const X = await loc('F5X'); const Y = await loc('F5Y'); const m = await material({ critico: true });
    const { ids } = await receberEAprovar([{ material_id: m.id, quantidade: 10 }, { material_id: m.id, quantidade: 10 }], [X.id, Y.id]);
    assert.strictEqual(await saldoEm(m.id, X.id), 10); assert.strictEqual(await saldoEm(m.id, Y.id), 10);
    const exec = await reprovarEDevolver(ids[0], 3);
    assert.strictEqual(exec.status, 200, JSON.stringify(exec.body));
    assert.strictEqual(await saldoEm(m.id, X.id), 7, 'nao saiu do endereco do item reprovado');
    assert.strictEqual(await saldoEm(m.id, Y.id), 10, 'tirou do outro item (o livro nao guarda o item)');
  });

  await test('Fase 5: endereco de entrada BLOQUEADO depois — a devolucao continua passando (sem origem, o de antes)', async () => {
    const P = await loc('F5P'); const X = await loc('F5B'); const m = await material({ padrao: P.id, critico: true });
    const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 20, localizacao_destino_id: P.id, motivo: 'e57' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const { ids } = await receberEAprovar([{ material_id: m.id, quantidade: 10 }], [X.id]);
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET bloqueada = 1 WHERE id = ?', [X.id]);
    const exec = await reprovarEDevolver(ids[0], 3);
    assert.strictEqual(exec.status, 200, JSON.stringify(exec.body));
    // Sem origem, a saida drena a padrao primeiro (o comportamento de antes) — e nao e recusada.
    assert.strictEqual(await saldoEm(m.id, P.id), 17);
    assert.strictEqual(await saldoEm(m.id, X.id), 10);
  });

  await test('Fase 5: RN-03 estrita — item REAL de outra nota, "12abc", booleano como localizacao', async () => {
    const A = await loc('F5V'); const m = await material();
    const outra = await nota([{ material: m.id, qtd: 1 }]); const esta = await nota([{ material: m.id, qtd: 1 }]);
    let r = await processar(esta.rec, { destinos: [{ item_id: outra.ids[0], localizacao_id: A.id }] });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, `Item ${outra.ids[0]} não pertence a este recebimento`);
    r = await processar(esta.rec, { destinos: [{ item_id: `${esta.ids[0]}abc`, localizacao_id: A.id }] });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, `Item ${esta.ids[0]}abc não pertence a este recebimento`);
    r = await processar(esta.rec, { destinos: [{ item_id: esta.ids[0], localizacao_id: true }] });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, `Destino inválido para o item ${esta.ids[0]}`);
    r = await processar(esta.rec, { destinos: [{ item_id: esta.ids[0], localizacao_id: String(A.id) }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 1);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
