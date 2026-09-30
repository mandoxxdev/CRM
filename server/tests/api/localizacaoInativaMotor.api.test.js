/**
 * Etapa 54 — o motor recusa o endereço INFORMADO que é inativo (como destino) ou inexistente, e a
 * padrão inativa é impedida na origem (desativação e cadastro).
 *
 * Plano: docs/superpowers/plans/2026-09-30-almoxarifado-etapa54-motor-recusa-localizacao-inativa.md
 *
 * Todo cenário de recusa tem a metade positiva no mesmo teste (o mesmo gesto num endereço ativo
 * passa) — senão uma recusa que pegasse TUDO passaria verde.
 *
 * Executar: cd server && node tests/api/localizacaoInativaMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const scrapService = require('../../services/almoxarifado/scrapService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 54: o motor recusa localizacao inativa ou inexistente ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (codigo, ativo = 1) => {
    const c = `E54-${codigo}-${++seq}`;
    const id = (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,?)', [c, codigo, ativo])).lastID;
    return { id, codigo: c };
  };
  const material = async (extra = {}) => {
    const c = `E54-M${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
        (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id) VALUES (?, 'Mat', 'UN', 0, ?, 'ACO', ?)`,
    [c, extra.ativo ?? 1, extra.padrao || null])).lastID;
    return { id, codigo: c };
  };
  const mov = (body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ motivo: 'e54', justificativa: 'e54', ...body });
  const desativar = (id) => dbRun(db, 'UPDATE localizacoes_almoxarifado SET ativo = 0 WHERE id = ?', [id]);
  const saldoEm = async (m, l) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id IS ?`, [m, l])).q);
  const ok = (r) => assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const recusa = (r, literal) => { assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, literal); };

  await test('RN-01 ENTRADA com destino INATIVO: 400 com a literal, e nada gravado; destino ativo passa', async () => {
    const I = await loc('I', 0); const A = await loc('A'); const m = await material();
    recusa(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: I.id }), `Localização ${I.codigo} está inativa`);
    assert.strictEqual(await saldoEm(m.id, I.id), 0);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m.id])).q, 0);
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A.id }));
  });

  await test('RN-01 AJUSTE_POSITIVO (familia de entrada) tambem recusa destino inativo', async () => {
    const I = await loc('IP', 0); const A = await loc('AP'); const m = await material();
    recusa(await mov({ material_id: m.id, tipo: 'AJUSTE_POSITIVO', quantidade: 2, localizacao_destino_id: I.id, justificativa: 'e54' }),
      `Localização ${I.codigo} está inativa`);
    ok(await mov({ material_id: m.id, tipo: 'AJUSTE_POSITIVO', quantidade: 2, localizacao_destino_id: A.id, justificativa: 'e54' }));
  });

  await test('RN-01 TRANSFERENCIA para destino inativo: 400, a origem nao perde nada', async () => {
    const A = await loc('TA'); const B = await loc('TB'); const I = await loc('TI', 0); const m = await material();
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: A.id }));
    recusa(await mov({ material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: 4, localizacao_origem_id: A.id, localizacao_destino_id: I.id }),
      `Localização ${I.codigo} está inativa`);
    assert.strictEqual(await saldoEm(m.id, A.id), 10);
    ok(await mov({ material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: 4, localizacao_origem_id: A.id, localizacao_destino_id: B.id }));
  });

  await test('RN-02 inexistente: destino, origem (SAIDA e TRANSFERENCIA) e AJUSTE com as literais', async () => {
    const A = await loc('NA'); const m = await material();
    recusa(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: 999999 }), 'Localização de destino não encontrada');
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 5, localizacao_destino_id: A.id }));
    recusa(await mov({ material_id: m.id, tipo: 'SAIDA', quantidade: 1, localizacao_origem_id: 999999 }), 'Localização de origem não encontrada');
    recusa(await mov({ material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: 1, localizacao_origem_id: 999999, localizacao_destino_id: A.id }),
      'Localização de origem não encontrada');
    recusa(await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 1, localizacao_destino_id: 999999, justificativa: 'e54' }),
      'Localização de destino não encontrada');
    assert.strictEqual(await saldoEm(m.id, 999999), 0);
    ok(await mov({ material_id: m.id, tipo: 'SAIDA', quantidade: 1, localizacao_origem_id: A.id }));
  });

  await test('RN-03 AJUSTE numa localizacao INATIVA: reduzir e zerar passam, subir e recusado', async () => {
    const L = await loc('AJ'); const m = await material();
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: L.id }));
    await desativar(L.id);
    recusa(await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 12, localizacao_destino_id: L.id, justificativa: 'e54' }),
      `Localização ${L.codigo} está inativa — o ajuste só pode reduzir ou zerar o saldo dela`);
    assert.strictEqual(await saldoEm(m.id, L.id), 10);
    ok(await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 4, localizacao_destino_id: L.id, justificativa: 'e54' }));
    assert.strictEqual(await saldoEm(m.id, L.id), 4);
    ok(await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: L.id, justificativa: 'e54' }));
    assert.strictEqual(await saldoEm(m.id, L.id), 0);
  });

  await test('RN-03 linha NEGATIVA numa inativa: zerar passa (o teto e max(atual, 0)); subir acima de 0 nao', async () => {
    const L = await loc('NG'); const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [m.id]);
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 3, localizacao_destino_id: L.id }));
    await desativar(L.id);
    ok(await mov({ material_id: m.id, tipo: 'SAIDA', quantidade: 5, localizacao_origem_id: L.id }));
    assert.strictEqual(await saldoEm(m.id, L.id), -2);
    recusa(await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 1, localizacao_destino_id: L.id }),
      `Localização ${L.codigo} está inativa — o ajuste só pode reduzir ou zerar o saldo dela`);
    ok(await mov({ material_id: m.id, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: L.id }));
    assert.strictEqual(await saldoEm(m.id, L.id), 0);
  });

  await test('id 0 e "nao informado" (como no resto do motor), nao "nao encontrada"', async () => {
    const m = await material();
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: 0 }));
  });

  await test('RN-04 ORIGEM inativa e aceita: SAIDA e TRANSFERENCIA esvaziam o endereco desativado', async () => {
    const L = await loc('OR'); const B = await loc('ORB'); const m = await material();
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: L.id }));
    await desativar(L.id);
    ok(await mov({ material_id: m.id, tipo: 'SAIDA', quantidade: 3, localizacao_origem_id: L.id }));
    ok(await mov({ material_id: m.id, tipo: 'TRANSFERENCIA', quantidade: 7, localizacao_origem_id: L.id, localizacao_destino_id: B.id }));
    assert.strictEqual(await saldoEm(m.id, L.id), 0); assert.strictEqual(await saldoEm(m.id, B.id), 7);
  });

  await test('Entrada SEM destino com padrao inativa (legado): continua aceita — decisao da Fase 2', async () => {
    const P = await loc('LP'); const m = await material({ padrao: P.id });
    await desativar(P.id);
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 2 }));
  });

  await test('RN-06 estorno de SAIDA para localizacao hoje inativa: continua possivel', async () => {
    const L = await loc('ES'); const m = await material();
    ok(await mov({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10, localizacao_destino_id: L.id }));
    const s = await mov({ material_id: m.id, tipo: 'SAIDA', quantidade: 3, localizacao_origem_id: L.id }); ok(s);
    await desativar(L.id);
    const r = await request(app).post(`/api/almoxarifado/movimentacoes/${s.body.id}/cancelar`).send({ motivo: 'e54' });
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, L.id), 10);
  });

  const MSG_PADRAO = (n, codigos) => `Localização é a padrão de ${n} material(is) ativo(s) (${codigos}). Troque a localização padrão deles antes de apagar ou desativar.`;

  await test('RN-04 rota: nao desativa (PUT) nem apaga (DELETE) localizacao que e padrao de material ATIVO', async () => {
    const P = await loc('DP'); const m1 = await material({ padrao: P.id }); const m2 = await material({ padrao: P.id });
    await material({ padrao: P.id, ativo: 0 }); // inativo nao conta
    const put = await request(app).put(`/api/almoxarifado/localizacoes/${P.id}`).send({ codigo: P.codigo, ativo: 0 });
    assert.strictEqual(put.status, 400, JSON.stringify(put.body));
    assert.strictEqual(put.body.error, MSG_PADRAO(2, `${m1.codigo}, ${m2.codigo}`));
    const del = await request(app).delete(`/api/almoxarifado/localizacoes/${P.id}`);
    assert.strictEqual(del.status, 400); assert.strictEqual(del.body.error, MSG_PADRAO(2, `${m1.codigo}, ${m2.codigo}`));
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [P.id])).ativo, 1);
    // Metade positiva: tirando a padrão dos dois, o DELETE passa.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = NULL WHERE id IN (?,?)', [m1.id, m2.id]);
    const ok2 = await request(app).delete(`/api/almoxarifado/localizacoes/${P.id}`);
    assert.strictEqual(ok2.status, 200, JSON.stringify(ok2.body));
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [P.id])).ativo, 0);
  });

  await test('RN-04 rota: mais de 5 materiais — lista os 5 primeiros e reticencias; PUT sem desativar nao e barrado', async () => {
    const P = await loc('D6'); const ms = [];
    for (let i = 0; i < 6; i++) ms.push(await material({ padrao: P.id }));
    const put = await request(app).put(`/api/almoxarifado/localizacoes/${P.id}`).send({ codigo: P.codigo, ativo: 0 });
    // A ordem e a do servidor (texto): ordena os 6 e pega 5 — nao a ordem de criacao (Fase 5).
    assert.strictEqual(put.body.error, MSG_PADRAO(6, `${ms.map((x) => x.codigo).sort().slice(0, 5).join(', ')}, …`));
    const edita = await request(app).put(`/api/almoxarifado/localizacoes/${P.id}`).send({ codigo: P.codigo, descricao: 'nova', ativo: 1 });
    assert.strictEqual(edita.status, 200, JSON.stringify(edita.body));
    // Metade positiva do PUT (Fase 5): sem padrao em uso, desativar pelo PUT passa.
    await dbRun(db, 'UPDATE materiais_almoxarifado SET localizacao_padrao_id = NULL WHERE localizacao_padrao_id = ?', [P.id]);
    const des = await request(app).put(`/api/almoxarifado/localizacoes/${P.id}`).send({ codigo: P.codigo, ativo: 0 });
    assert.strictEqual(des.status, 200, JSON.stringify(des.body));
    assert.strictEqual((await dbGet(db, 'SELECT ativo FROM localizacoes_almoxarifado WHERE id = ?', [P.id])).ativo, 0);
  });

  await test('RN-05 cadastro: POST e PUT recusam padrao inativa ou inexistente; editar outro campo de legado passa', async () => {
    const I = await loc('CI', 0); const A = await loc('CA');
    const fam = await request(app).post('/api/almoxarifado/familias').send({ nome: `Fam E54 ${++seq}` });
    assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
    const base = { nome: 'Mat E54', unidade: 'UN', familia_id: fam.body.id };
    let r = await request(app).post('/api/almoxarifado/materiais').send({ ...base, codigo: `E54-C${++seq}`, localizacao_padrao_id: I.id });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, `Localização padrão ${I.codigo} está inativa`);
    r = await request(app).post('/api/almoxarifado/materiais').send({ ...base, codigo: `E54-C${++seq}`, localizacao_padrao_id: 999999 });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'Localização padrão não encontrada');
    r = await request(app).post('/api/almoxarifado/materiais').send({ ...base, codigo: `E54-C${++seq}`, localizacao_padrao_id: A.id });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = r.body.id;
    const p = await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ localizacao_padrao_id: I.id });
    assert.strictEqual(p.status, 400); assert.strictEqual(p.body.error, `Localização padrão ${I.codigo} está inativa`);
    // Legado: a padrão ficou inativa depois (SQL) — editar o nome, reenviando a MESMA padrão, passa.
    await desativar(A.id);
    const n = await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ nome: 'Renomeado', localizacao_padrao_id: A.id });
    assert.strictEqual(n.status, 200, JSON.stringify(n.body));
    // Tirar a padrao (null) nao valida nada e passa.
    const semPadrao = await request(app).put(`/api/almoxarifado/materiais/${id}`).send({ localizacao_padrao_id: null });
    assert.strictEqual(semPadrao.status, 200, JSON.stringify(semPadrao.body));
    assert.strictEqual((await dbGet(db, 'SELECT localizacao_padrao_id p FROM materiais_almoxarifado WHERE id = ?', [id])).p, null);
  });

  await test('Recebimento: nota com destino INATIVO e recusada inteira, antes de qualquer item entrar', async () => {
    const I = await loc('RI', 0); const m1 = await material(); const m2 = await material();
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme', '2026-08-01', '2026-08-02', 100)`, [`REC-E54-${++seq}`, `NF-E54-${seq}`])).lastID;
    for (const m of [m1, m2]) {
      await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, quantidade_esperada, quantidade_recebida)
        VALUES (?,?,5,5)`, [rec, m.id]);
    }
    const recRow = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [rec]);
    await assert.rejects(() => receiptService.darEntradaEstoque(db, ADMIN, recRow, rec, { localizacao_id: I.id }),
      // Literal EXATA: sem a pre-checagem, o item 1 cairia no motor com outra mensagem — o `movs === 0`
      // sozinho nao distinguia os dois caminhos (Fase 5).
      (e) => { assert.strictEqual(e.message, `Nao foi possivel dar entrada no estoque: Localização ${I.codigo} está inativa`); return e.status === 400; });
    const movs = await dbAll(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id IN (?,?)', [m1.id, m2.id]);
    assert.strictEqual(movs.length, 0);
    // Metade positiva: com destino ativo, os dois entram.
    const A = await loc('RA');
    await receiptService.darEntradaEstoque(db, ADMIN, recRow, rec, { localizacao_id: A.id });
    assert.strictEqual(await saldoEm(m1.id, A.id), 5); assert.strictEqual(await saldoEm(m2.id, A.id), 5);
  });

  await test('Retalho: destino INATIVO recusado ANTES da baixa — o livro da origem fica limpo', async () => {
    const A = await loc('RTA'); const I = await loc('RTI', 0);
    const origem = await material(); const retalho = await material();
    ok(await mov({ material_id: origem.id, tipo: 'ENTRADA', quantidade: 100, localizacao_destino_id: A.id }));
    const antes = (await dbAll(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ?', [origem.id])).length;
    await assert.rejects(() => scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id, baixar_original: true,
      quantidade_baixa: 30, quantidade_retalho: 1, localizacao_id: I.id,
    }), (e) => e.status === 400 && e.message === `Localização ${I.codigo} está inativa`);
    assert.strictEqual((await dbAll(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ?', [origem.id])).length, antes);
    const r = await scrapService.gerarRetalho(db, ADMIN, {
      material_origem_id: origem.id, material_retalho_id: retalho.id, baixar_original: true,
      quantidade_baixa: 30, quantidade_retalho: 1, localizacao_id: A.id,
    });
    assert.ok(r);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
