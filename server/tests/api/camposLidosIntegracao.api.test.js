/**
 * Etapa 125 (T6) — integracao que cruza os galhos: os campos lidos pelo formulario (D (124) item 1, T1/T3) e o Reativar da aba
 * Familias sem o nome (D (124) item 2, T2/T4), com os corpos que as telas mandam.
 *
 * (i) PELA ROTA, de ponta a ponta: familia e material cadastrados pelas rotas; duas "abas" no mesmo material montando o corpo do
 * formulario (`handleSubmit`); o 409; recarregar e salvar; uma Entrada com custo pelo MOTOR com a aba aberta; o 409 do custo;
 * recarregar e salvar. Depois a familia: inativada pela rota, renomeada por outro Administrador, reativada com `{ativo: 1}`.
 * (ii) PELO SERVICO: `materialService.camposDesfeitos` e `mensagemCamposMudadosPorOutro`.
 *
 * Executar: cd server && node tests/api/camposLidosIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const materialService = require('../../services/almoxarifado/materialService');
const { COLUNAS_CAMPOS_LIDOS } = require('../../services/almoxarifado/camposLidos');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ADM2 = { id: 6, nome: 'Adm Dois', role: 'user', email: 'adm2@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const CAUDA = ' por outra pessoa depois que você abriu o cadastro — salvar desfaria ';
const FIM = 'e nada foi gravado. Recarregue o material e salve de novo.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };

  /** O formulario: o estado do `loadMaterial` e o corpo do `handleSubmit`, com os tres "lidos" do carregado. */
  const abrirFormulario = async (id) => {
    const r = await as(ALMOX, () => request(app).get(`/api/almoxarifado/materiais/${id}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const m = r.body;
    return (alt = {}) => ({
      codigo: m.codigo, nome: m.nome, descricao: m.descricao || '', categoria: m.categoria || '', unidade: m.unidade || 'UN',
      familia_id: m.familia_id || null, subfamilia_id: m.subfamilia_id || null, localizacao_padrao_id: m.localizacao_padrao_id || null,
      quantidade_atual: m.quantidade_atual ?? '', quantidade_minima: m.quantidade_minima ?? '', quantidade_maxima: m.quantidade_maxima ?? '',
      custo_unitario: m.custo_unitario ?? '', marca: m.marca || '', classe_abc: m.classe_abc || null,
      proprietario_cliente_id: m.proprietario_cliente_id || null, material_critico: !!m.material_critico,
      controle_lote: !!m.controle_lote, controle_serie: !!m.controle_serie,
      unidade_compra: m.unidade_compra || '', fator_conversao_compra: m.unidade_compra ? m.fator_conversao_compra : null,
      ...alt,
      controles_lidos: { controle_lote: !!m.controle_lote, controle_serie: !!m.controle_serie },
      familia_lida: { familia_id: m.familia_id ? Number(m.familia_id) : null, subfamilia_id: m.subfamilia_id ? Number(m.subfamilia_id) : null },
      campos_lidos: Object.fromEntries(COLUNAS_CAMPOS_LIDOS.map((c) => [c, m[c] ?? null])),
    });
  };
  const putMaterial = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT nome, unidade, quantidade_minima, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [id]);

  console.log('\n(i) pela rota');

  await test('duas abas, o 409 dos campos, recarregar e salvar; o custo do motor; depois a familia reativada sem o nome', async () => {
    let r = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Integra 125', codigo: 'I125' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const F = { id: r.body.id, nome: 'Integra 125' };
    r = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'I125-001', nome: 'Junta 125', familia_id: F.id, categoria: 'CONSUMÍVEL', unidade: 'PC', custo_unitario: 10 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = r.body.id;

    // aba A abre; aba B abre, troca unidade e estoque minimo e salva (200)
    const abaA = await abrirFormulario(id);
    const abaB = await abrirFormulario(id);
    r = await putMaterial(ALMOX, id, abaB({ unidade: 'KG', quantidade_minima: '3' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // aba A renomeia com o que mostrava -> 409 plural, nada gravado
    r = await putMaterial(ALMOX, id, abaA({ nome: 'Junta renomeada' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Os campos "Unidade de Medida" e "Estoque Mínimo" do material I125-001 foram mudados${CAUDA}essas mudanças, ${FIM}`);
    assert.deepStrictEqual(await linha(id), { nome: 'Junta 125', unidade: 'KG', quantidade_minima: 3, custo_unitario: 10 });
    // recarrega e salva -> 200, com a unidade e o minimo da aba B
    const abaA2 = await abrirFormulario(id);
    r = await putMaterial(ALMOX, id, abaA2({ nome: 'Junta renomeada' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await linha(id), { nome: 'Junta renomeada', unidade: 'KG', quantidade_minima: 3, custo_unitario: 10 });

    // o recebimento: uma Entrada com custo pelo motor, com o formulario aberto
    const abaC = await abrirFormulario(id);
    await stockService.registrarMovimentacao(db, SUPER, { material_id: id, tipo: 'ENTRADA', quantidade: 4, custo_unitario: 42,
      motivo: 'compra' });
    r = await putMaterial(ALMOX, id, abaC({ marca: 'Marca C' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `O campo "Custo Unitário" do material I125-001 foi mudado${CAUDA}essa mudança, ${FIM}`);
    assert.strictEqual((await linha(id)).custo_unitario, 42);
    const abaC2 = await abrirFormulario(id);
    r = await putMaterial(ALMOX, id, abaC2({ marca: 'Marca C' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(id)).custo_unitario, 42);

    // a familia: o material sai dela (outra familia), inativada pela rota, renomeada por outro Administrador; o Reativar da aba
    // (lista carregada antes do renomear) manda so {ativo: 1}
    r = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Integra 125 B', codigo: 'I125B' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const abaD = await abrirFormulario(id);
    r = await putMaterial(ALMOX, id, abaD({ familia_id: r.body.id }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(ADM, () => request(app).delete(`/api/almoxarifado/familias/${F.id}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const lista = await as(ADM, () => request(app).get('/api/almoxarifado/familias?ativo=all'));
    const naLista = lista.body.find((f) => f.id === F.id);
    assert.strictEqual(naLista.nome, 'Integra 125');
    r = await as(ADM2, () => request(app).put(`/api/almoxarifado/familias/${F.id}`).send({ nome: 'Integra 125 renomeada',
      descricao: 'd', tipo_uso: 'industrial' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(ADM, () => request(app).put(`/api/almoxarifado/familias/${naLista.id}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const fam = await dbGet(db, 'SELECT nome, ativo, descricao, tipo_uso FROM familias_material_almoxarifado WHERE id = ?', [F.id]);
    assert.deepStrictEqual(fam, { nome: 'Integra 125 renomeada', ativo: 1, descricao: 'd', tipo_uso: 'industrial' });
  });

  console.log('\n(ii) pelo servico');

  await test('camposDesfeitos: lido = gravado nao recusa; lido != gravado e o salvar desfaria recusa, com os rotulos juntos', async () => {
    const gravado = { nome: 'B', unidade: 'KG', unidade_compra: 'PCT', fator_conversao_compra: 50, custo_unitario: 42 };
    assert.deepStrictEqual(materialService.camposDesfeitos({ nome: 'B' }, gravado, { nome: 'C' }), []);
    assert.deepStrictEqual(materialService.camposDesfeitos({ nome: 'A' }, gravado, { nome: 'B' }), []);
    assert.deepStrictEqual(materialService.camposDesfeitos(undefined, gravado, { nome: 'A' }), []);
    assert.deepStrictEqual(materialService.camposDesfeitos(
      { nome: 'A', unidade: 'PC', unidade_compra: 'CX', fator_conversao_compra: 12, custo_unitario: 10 }, gravado,
      { nome: 'A', unidade: 'PC', unidade_compra: 'CX', fator_conversao_compra: '12', custo_unitario: 10 }),
    ['Nome do Material', 'Unidade de Medida', 'Custo Unitário', 'Como é comprado']);
  });

  await test('mensagemCamposMudadosPorOutro: singular, dois, tres', async () => {
    assert.strictEqual(materialService.mensagemCamposMudadosPorOutro('X-1', ['Marca']),
      `O campo "Marca" do material X-1 foi mudado${CAUDA}essa mudança, ${FIM}`);
    assert.strictEqual(materialService.mensagemCamposMudadosPorOutro('X-1', ['Marca', 'Modelo']),
      `Os campos "Marca" e "Modelo" do material X-1 foram mudados${CAUDA}essas mudanças, ${FIM}`);
    assert.strictEqual(materialService.mensagemCamposMudadosPorOutro('X-1', ['A', 'B', 'C']),
      `Os campos "A", "B" e "C" do material X-1 foram mudados${CAUDA}essas mudanças, ${FIM}`);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
