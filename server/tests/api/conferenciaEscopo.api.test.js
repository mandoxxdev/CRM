/**
 * Etapa 10b, Task 1 — RN-01/RN-02: escopo combinável na criação da conferência.
 *
 * `POST /conferencias` passa a aceitar, além de `categoria` (existente), os filtros
 * combináveis por E: `familia_id`, `classe_abc` ('A'|'B'|'C'), `apenas_criticos`,
 * `apenas_de_clientes`, `apenas_em_terceiros`. `classe_abc` fora de A/B/C é 400 (único filtro
 * de domínio fechado); os demais que não casam nada só geram conferência vazia — mesmo
 * comportamento que `categoria` inexistente já tinha. A conferência grava `escopo_descricao`
 * (partes na ordem fixa, juntadas por " + ", "Geral" sem filtro) e ecoa `dupla_contagem`.
 *
 * RN-02: `apenas_em_terceiros` limita aos materiais com retenção > 0, mas o esperado de cada
 * item continua descontando `quantidade_em_terceiros` (regra da Etapa 8b, inalterada).
 *
 * Executar: cd server && node tests/api/conferenciaEscopo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 100, categoria = null, familia_id = null, classe_abc = null,
  critico = 0, cliente_id = null, em_terceiros = 0 } = {}) {
  seq += 1;
  const codigo = `ESC-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, categoria, familia_id, classe_abc,
       material_critico, proprietario_cliente_id, quantidade_em_terceiros)
     VALUES (?,?,'UN',?,1,?,?,?,?,?,?)`,
    [codigo, `Material Escopo ${seq}`, qtd, categoria, familia_id, classe_abc, critico, cliente_id, em_terceiros]);
  return { id: r.lastID, codigo };
}

async function itensDaConferencia(db, confId) {
  return dbAll(db, `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?`, [confId]);
}

async function abrirConferencia(app, body = {}) {
  return request(app).post('/api/almoxarifado/conferencias').send(body);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  setUser(ALMOXARIFE);

  await test('RN-01: classe_abc invalida recusa 400 com a mensagem literal', async () => {
    const res = await abrirConferencia(app, { classe_abc: 'X' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Classe ABC inválida (use A, B ou C)');
  });

  await test('RN-01: classe minuscula vale e filtra como maiuscula', async () => {
    const categoria = 'CAT-RN01-CLASSE';
    const matA = await novoMaterial(db, { categoria, classe_abc: 'A' });
    await novoMaterial(db, { categoria, classe_abc: 'B' });

    const res = await abrirConferencia(app, { classe_abc: 'a', categoria });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.totalItens, 1, JSON.stringify(res.body));
    // A normalizacao vale tambem para a DESCRICAO, nao so para o WHERE — 'a' vira 'Classe A'.
    assert.strictEqual(res.body.escopo_descricao, 'Categoria: CAT-RN01-CLASSE + Classe A', JSON.stringify(res.body));

    const itens = await itensDaConferencia(db, res.body.id);
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].material_id, matA.id);
  });

  await test('RN-01: familia_id filtra', async () => {
    const famR = await dbRun(db,
      `INSERT INTO familias_material_almoxarifado (codigo, nome) VALUES ('FAM-RN01', 'Fam RN01')`);
    const familiaId = famR.lastID;
    // Uma SEGUNDA familia com id MAIOR, na mesma categoria: e o que separa `= ?` de um
    // operador errado tipo `>= ?` (sabotagem rodada de verdade — sem este material, `>=`
    // passava 8/8 porque NULL >= x tambem exclui o matFora).
    const famR2 = await dbRun(db,
      `INSERT INTO familias_material_almoxarifado (codigo, nome) VALUES ('FAM-RN01-B', 'Fam RN01 B')`);
    const categoria = 'CAT-RN01-FAM';
    const matDentro = await novoMaterial(db, { categoria, familia_id: familiaId });
    const matFora = await novoMaterial(db, { categoria, familia_id: null });
    const matOutraFamilia = await novoMaterial(db, { categoria, familia_id: famR2.lastID });

    // Categoria unica fixa o universo do teste: o filtro de familia tem de provar INCLUSAO E
    // EXCLUSAO (achado da revisao da task: sem o assert de ausencia, trocar o operador do
    // filtro por `familia_id >= ?` passava verde).
    const res = await abrirConferencia(app, { categoria, familia_id: familiaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.totalItens, 1, JSON.stringify(res.body));
    assert.strictEqual(res.body.escopo_descricao, 'Categoria: CAT-RN01-FAM + Família: Fam RN01', JSON.stringify(res.body));

    const itens = await itensDaConferencia(db, res.body.id);
    const idsRetornados = itens.map((i) => i.material_id);
    assert.ok(idsRetornados.includes(matDentro.id), 'material dentro da familia deveria estar na conferencia');
    assert.ok(!idsRetornados.includes(matFora.id), 'material FORA da familia nao deveria estar na conferencia');
    assert.ok(!idsRetornados.includes(matOutraFamilia.id), 'material de OUTRA familia nao deveria estar na conferencia');

    // Família sem cadastro: literal congelado é "Família #<id>" (SEM dois-pontos).
    const resSemCadastro = await abrirConferencia(app, { familia_id: 999999 });
    assert.strictEqual(resSemCadastro.status, 201, JSON.stringify(resSemCadastro.body));
    assert.strictEqual(resSemCadastro.body.escopo_descricao, 'Família #999999', JSON.stringify(resSemCadastro.body));
    assert.strictEqual(resSemCadastro.body.totalItens, 0, JSON.stringify(resSemCadastro.body));
  });

  await test('RN-01: apenas_criticos e apenas_de_clientes filtram', async () => {
    const clienteR = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Escopo')`);
    const clienteId = clienteR.lastID;
    const categoria = 'CAT-RN01-CRIT-CLI';
    const matAlvo = await novoMaterial(db, { categoria, critico: 1, cliente_id: clienteId });
    await novoMaterial(db, { categoria, critico: 1, cliente_id: null });
    await novoMaterial(db, { categoria, critico: 0, cliente_id: clienteId });
    await novoMaterial(db, { categoria, critico: 0, cliente_id: null });

    const res = await abrirConferencia(app, { categoria, apenas_criticos: true, apenas_de_clientes: true });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.totalItens, 1, JSON.stringify(res.body));

    const itens = await itensDaConferencia(db, res.body.id);
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].material_id, matAlvo.id);
  });

  await test('RN-02: apenas_em_terceiros limita a retencao > 0 e o esperado desconta', async () => {
    const categoria = 'CAT-RN02-TERC';
    const matTerceiros = await novoMaterial(db, { categoria, qtd: 50, em_terceiros: 20 });
    await novoMaterial(db, { categoria, qtd: 50, em_terceiros: 0 });

    const res = await abrirConferencia(app, { categoria, apenas_em_terceiros: true });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.totalItens, 1, JSON.stringify(res.body));

    const itens = await itensDaConferencia(db, res.body.id);
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].material_id, matTerceiros.id);
    assert.strictEqual(itens[0].quantidade_sistema, 30, JSON.stringify(itens[0]));
  });

  await test('RN-01: escopo_descricao combinada na ordem fixa', async () => {
    const categoria = 'CAT-DESC';
    await novoMaterial(db, { categoria, classe_abc: 'A', critico: 1 });

    const res = await abrirConferencia(app, { categoria, classe_abc: 'A', apenas_criticos: true });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.escopo_descricao, 'Categoria: CAT-DESC + Classe A + Somente críticos', JSON.stringify(res.body));

    // TODAS as seis partes de uma vez, contra a string inteira — e o que prende os literais
    // 'Materiais de clientes'/'Com saldo em terceiros' e a POSICAO de 'Família' (achado da
    // revisao da task: cada um deles podia mudar sozinho com a suite verde).
    const famR = await dbRun(db,
      `INSERT INTO familias_material_almoxarifado (codigo, nome) VALUES ('FAM-DESC6', 'Fam Descricao')`);
    const resSeis = await abrirConferencia(app, {
      categoria: 'CAT-DESC-SEIS', familia_id: famR.lastID, classe_abc: 'C',
      apenas_criticos: true, apenas_de_clientes: true, apenas_em_terceiros: true,
    });
    assert.strictEqual(resSeis.status, 201, JSON.stringify(resSeis.body));
    assert.strictEqual(resSeis.body.escopo_descricao,
      'Categoria: CAT-DESC-SEIS + Família: Fam Descricao + Classe C + Somente críticos + Materiais de clientes + Com saldo em terceiros',
      JSON.stringify(resSeis.body));

    const resGeral = await abrirConferencia(app, {});
    assert.strictEqual(resGeral.status, 201, JSON.stringify(resGeral.body));
    assert.strictEqual(resGeral.body.escopo_descricao, 'Geral', JSON.stringify(resGeral.body));
  });

  await test('RN-01: filtro sem match cria vazia com totalItens 0', async () => {
    const res = await abrirConferencia(app, { categoria: 'CAT-INEXISTENTE-RN01' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.totalItens, 0, JSON.stringify(res.body));
    assert.ok(res.body.escopo_descricao, 'escopo_descricao deveria estar presente mesmo na conferencia vazia');
  });

  await test('RN-01: dupla_contagem ecoada no 201 e PERSISTIDA na linha', async () => {
    // Ramo vazio (o eco do primeiro return).
    const resTrue = await abrirConferencia(app, { categoria: 'CAT-INEXISTENTE-DUPLA', dupla_contagem: true });
    assert.strictEqual(resTrue.status, 201, JSON.stringify(resTrue.body));
    assert.strictEqual(resTrue.body.dupla_contagem, 1, JSON.stringify(resTrue.body));

    const resFalse = await abrirConferencia(app, { categoria: 'CAT-INEXISTENTE-DUPLA' });
    assert.strictEqual(resFalse.status, 201, JSON.stringify(resFalse.body));
    assert.strictEqual(resFalse.body.dupla_contagem, 0, JSON.stringify(resFalse.body));

    // Ramo NAO-vazio (achado da revisao da task: so o ramo vazio era aferido — apagar o eco
    // do segundo return passava verde) + persistencia na tabela (idem: trocar os params do
    // INSERT por null,null passava verde, e as Tasks 2 e 3 leem exatamente essas colunas).
    const categoria = 'CAT-DUPLA-CHEIA';
    await novoMaterial(db, { categoria });
    const resCheia = await abrirConferencia(app, { categoria, dupla_contagem: true });
    assert.strictEqual(resCheia.status, 201, JSON.stringify(resCheia.body));
    assert.strictEqual(resCheia.body.totalItens, 1, JSON.stringify(resCheia.body));
    assert.strictEqual(resCheia.body.dupla_contagem, 1, JSON.stringify(resCheia.body));
    assert.strictEqual(resCheia.body.escopo_descricao, 'Categoria: CAT-DUPLA-CHEIA', JSON.stringify(resCheia.body));

    const linha = await dbGet(db,
      `SELECT dupla_contagem, escopo_descricao FROM conferencias_almoxarifado WHERE id = ?`, [resCheia.body.id]);
    assert.strictEqual(linha.dupla_contagem, 1, JSON.stringify(linha));
    assert.strictEqual(linha.escopo_descricao, 'Categoria: CAT-DUPLA-CHEIA', JSON.stringify(linha));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
