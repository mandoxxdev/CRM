/**
 * Etapa 192 (Compras), I1 — integracao que cruza as tres frentes (F1 fornecedor, P1 pedido, M1 materiais no Compras), pelas
 * rotas, sem chamar servico direto:
 *   1. o administrador do Compras (sem perfil de almoxarifado) cadastra um material com NCM e peso pela porta do Compras (M1);
 *   2. a busca de material do pedido o encontra JA com NCM e peso (P1, RN-192.09);
 *   3. o fornecedor pessoa fisica e cadastrado com CPF e nome em minusculas (F1, RN-192.01/05);
 *   4. o pedido sai para esse fornecedor com OS digitada e o item SEM NCM no corpo (P1, RN-192.07);
 *   5. o documento do pedido mostra o nome em MAIUSCULAS, `CPF` no lugar do CNPJ, `OS: <texto>` e o NCM do material.
 * Plano: docs/superpowers/plans/2026-10-30-compras-etapa192-cpf-maiusculas-os-digitada-ncm-materiais.md
 *
 * Executar: cd server && node tests/api/comprasEtapa192Integracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ADMIN_COMPRAS = { id: 2, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const textoDoHtml = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  const FAM = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('FLG','Flanges',1)")).lastID;

  console.log('\n═══ Etapa 192 — integracao: material pelo Compras → pedido com fornecedor CPF e OS digitada → documento ═══\n');

  let materialId; let fornecedorId; let pedidoId;

  await test('1. admin do Compras cadastra material pela porta do Compras (201)', async () => {
    setUser(ADMIN_COMPRAS);
    const r = await request(app).post('/api/compras/materiais/cadastro').send({
      codigo: 'FLG-E192I', nome: 'Flange cego 4pol E192I', unidade: 'PC', categoria: 'OUTROS', familia_id: FAM, ncm: '7307.91.00', peso_unitario: 3.75,
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    materialId = r.body.id || (await dbGet(db, "SELECT id FROM materiais_almoxarifado WHERE nome = 'Flange cego 4pol E192I'")).id;
    assert.ok(materialId, 'material nao gravado');
  });

  await test('2. a busca de material do pedido traz o material com NCM e peso', async () => {
    setUser(ADMIN);
    const r = await request(app).get('/api/compras/materiais').query({ search: 'Flange cego 4pol E192I' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const m = r.body.find((x) => Number(x.id) === Number(materialId));
    assert.ok(m, 'busca nao achou o material criado pelo Compras');
    assert.strictEqual(m.ncm, '7307.91.00');
    assert.strictEqual(Number(m.peso_unitario), 3.75);
  });

  await test('3. fornecedor pessoa fisica com CPF, nome digitado em minusculas, grava em MAIUSCULAS', async () => {
    const r = await request(app).post('/api/compras/fornecedores').send({
      razao_social: 'joão da silva serralheria', cpf: '529.982.247-25', cidade: 'são paulo', email: 'Joao@Exemplo.com',
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    fornecedorId = r.body.id;
    const f = await dbGet(db, 'SELECT razao_social, cpf, cnpj, cidade, email FROM fornecedores WHERE id = ?', [fornecedorId]);
    assert.strictEqual(f.razao_social, 'JOÃO DA SILVA SERRALHERIA');
    assert.strictEqual(f.cidade, 'SÃO PAULO');
    assert.strictEqual(f.cpf, '529.982.247-25');
    assert.ok(!f.cnpj, 'CNPJ deveria estar vazio');
    assert.strictEqual(f.email, 'Joao@Exemplo.com');
  });

  await test('4. pedido para esse fornecedor com OS digitada e item sem NCM no corpo (201)', async () => {
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: fornecedorId, os_texto: 'OS 7781 externa',
      itens: [{ material_id: materialId, quantidade: 2, valor_unitario: 150 }],
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    pedidoId = r.body.id;
    const p = await dbGet(db, 'SELECT os_id, os_texto FROM pedidos_compra WHERE id = ?', [pedidoId]);
    assert.deepStrictEqual(p, { os_id: null, os_texto: 'OS 7781 externa' });
  });

  await test('5. documento: nome em maiusculas, CPF (nao CNPJ), OS digitada e NCM do material', async () => {
    const r = await request(app).get(`/api/compras/pedidos/${pedidoId}/documento`);
    assert.strictEqual(r.status, 200, r.text.slice(0, 300));
    const t = textoDoHtml(r.text);
    assert.ok(t.includes('JOÃO DA SILVA SERRALHERIA'), 'documento sem o nome em maiusculas');
    assert.ok(t.includes('CPF') && t.includes('529.982.247-25'), 'documento sem o CPF do fornecedor');
    assert.ok(t.includes('OS: OS 7781 externa'), 'documento sem a OS digitada');
    assert.ok(t.includes('7307.91.00'), 'documento sem o NCM do material');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
