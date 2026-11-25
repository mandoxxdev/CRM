/**
 * Etapa 263 (RN-263.08) — Aplicação, Especificações Técnicas e Descrição saíram do formulário de material, mas as colunas
 * ficam e o texto antigo não pode se perder.
 *
 * O formulário (MaterialAlmoxarifadoForm) passou a NÃO mandar as três chaves no POST/PUT (a revisão do plano mostrou que
 * reenviar o valor carregado dava 409 sobre um campo que a tela não mostra mais, quando outra pessoa o mudava). Este arquivo
 * prova, pela porta do Compras, o contrato do servidor de que a tela depende: chave AUSENTE preserva o gravado (`val(k)` de
 * `editarMaterial`), e a conferência de edição concorrente (`campos_lidos`, Etapa 125) não recusa o campo que não veio.
 * A metade positiva: o mesmo PUT COM a chave (o corpo antigo) leva o 409 nomeando "Descrição" — a conferência está ligada.
 *
 * Executar: cd server && node tests/api/materialCamposRetirados.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const ADMIN_COMPRAS = { id: 6, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };

(async () => {
  console.log('\n═══ Material — campos retirados do formulário (API) ═══\n');
  const { app, db, close } = await createTestApp({ user: ADMIN_COMPRAS });
  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('VLV','Valvulas',1)")).lastID;
  const novo = async (codigo) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, categoria, familia_id, descricao, aplicacao, especificacoes, ativo)
    VALUES (?, 'Valvula gaveta', 'PC', 'OUTROS', ?, 'Descricao antiga', 'Linha de vapor', '150 psi, inox 316', 1)`, [codigo, FAM])).lastID;
  const lidosDe = (row) => ({ nome: row.nome, descricao: row.descricao, aplicacao: row.aplicacao, especificacoes: row.especificacoes });

  await test('RN-263.08 (a) PUT sem as tres chaves grava o resto e preserva Descricao, Aplicacao e Especificacoes', async () => {
    const id = await novo('VLV-101');
    const aberto = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    const r = await request(app).put(`/api/compras/materiais/cadastro/${id}`)
      .send({ nome: 'Valvula gaveta 1 pol', campos_lidos: lidosDe(aberto) });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT nome, descricao, aplicacao, especificacoes FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.ok(/1 pol/i.test(row.nome), `metade positiva: o nome gravou (${row.nome})`);
    assert.strictEqual(row.descricao, 'Descricao antiga');
    assert.strictEqual(row.aplicacao, 'Linha de vapor');
    assert.strictEqual(row.especificacoes, '150 psi, inox 316');
  });

  await test('RN-263.08 (b) outra pessoa mudou a Descricao depois de abrir: o PUT sem a chave nao recusa e nao desfaz', async () => {
    const id = await novo('VLV-102');
    const aberto = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    await dbRun(db, "UPDATE materiais_almoxarifado SET descricao = 'Mudada por outra pessoa' WHERE id = ?", [id]);
    const r = await request(app).put(`/api/compras/materiais/cadastro/${id}`)
      .send({ nome: 'Valvula gaveta 2 pol', campos_lidos: lidosDe(aberto) });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const row = await dbGet(db, 'SELECT descricao FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(row.descricao, 'Mudada por outra pessoa');
  });

  await test('RN-263.08 (c) metade positiva: o corpo ANTIGO (com a chave descricao) leva o 409 nomeando "Descrição"', async () => {
    const id = await novo('VLV-103');
    const aberto = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
    await dbRun(db, "UPDATE materiais_almoxarifado SET descricao = 'Mudada por outra pessoa' WHERE id = ?", [id]);
    const r = await request(app).put(`/api/compras/materiais/cadastro/${id}`)
      .send({ nome: 'Valvula gaveta 3 pol', descricao: aberto.descricao, campos_lidos: lidosDe(aberto) });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.ok(/"Descrição"/.test(r.body.error), r.body.error);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
