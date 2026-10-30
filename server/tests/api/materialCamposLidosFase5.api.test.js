/**
 * Etapa 125 (Fase 5, revisor de sabotagem r3) — os cenarios que as sabotagens mostraram sem prova: 22 das 37 colunas da lista nao
 * tinham teste de comportamento (remover a coluna ou trocar o rotulo passava verde); o custo mudado pelo proprio usuario e o custo
 * que o motor e o usuario gravaram iguais; o vazio que vira numero; o lido numa outra representacao; o texto que so muda de caixa.
 * Escritos pelo revisor numa sonda (verdes no codigo da etapa, e derrubando 54 de 57 sabotagens sobreviventes) e trazidos para ca.
 * O cenario (d) foi trocado do Estoque Maximo para o Ponto de Reposicao: desde a Fase 5 (r1 M1) o minimo e o maximo tratam NULL
 * como 0 (a aba Estoques minimos regrava NULL como 0) — e o (d2) prende isso.
 *
 * Executar: cd server && node tests/api/materialCamposLidosFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

// O contrato congelado do plano da Etapa 125 (por extenso, nao importado do servico).
const CAMPOS_LIDOS = ['codigo', 'nome', 'descricao', 'descricao_tecnica', 'categoria', 'tipo_material', 'material_critico',
  'proprietario_cliente_id', 'fabricante', 'codigo_fabricante', 'marca', 'modelo', 'norma', 'material_construtivo',
  'peso_unitario', 'dimensoes', 'ncm', 'aplicacao', 'especificacoes', 'observacoes', 'unidade', 'quantidade_minima',
  'quantidade_maxima', 'ponto_reposicao', 'lote_economico', 'localizacao_padrao_id', 'controle_validade', 'controle_corrida',
  'controle_certificado', 'requer_inspecao', 'requer_foto', 'classe_abc', 'custo_unitario', 'unidade_compra',
  'fator_conversao_compra', 'fornecedor_principal', 'codigo_fornecedor'];
const CAUDA1 = ' foi mudado por outra pessoa depois que você abriu o cadastro — salvar desfaria essa mudança, e nada foi '
  + 'gravado. Recarregue o material e salve de novo.';
const CAUDAN = ' foram mudados por outra pessoa depois que você abriu o cadastro — salvar desfaria essas mudanças, e nada foi '
  + 'gravado. Recarregue o material e salve de novo.';
const E1 = (codigo, rotulos) => (rotulos.length === 1
  ? `O campo "${rotulos[0]}" do material ${codigo}${CAUDA1}`
  : `Os campos ${rotulos.slice(0, -1).map((r) => `"${r}"`).join(', ')} e "${rotulos[rotulos.length - 1]}" do material ${codigo}${CAUDAN}`);

/**
 * O formulario de verdade (MaterialAlmoxarifadoForm: `loadMaterial` monta o estado, `handleSubmit` monta o corpo), a partir do
 * GET. `campos_lidos` = os valores CRUS do GET (o contrato da RN-08).
 */
function formularioDe(m) {
  const form = {
    codigo: m.codigo || '', nome: m.nome || '', descricao: m.descricao || '', categoria: m.categoria || '',
    unidade: m.unidade || 'UN', familia_id: m.familia_id ? String(m.familia_id) : '',
    subfamilia_id: m.subfamilia_id ? String(m.subfamilia_id) : '',
    localizacao_padrao_id: m.localizacao_padrao_id ? String(m.localizacao_padrao_id) : '',
    quantidade_atual: m.quantidade_atual ?? '', quantidade_minima: m.quantidade_minima ?? '',
    quantidade_maxima: m.quantidade_maxima ?? '', custo_unitario: m.custo_unitario ?? '',
    fornecedor_principal: m.fornecedor_principal || '', codigo_fornecedor: m.codigo_fornecedor || '', ncm: m.ncm || '',
    especificacoes: m.especificacoes || '', observacoes: m.observacoes || '', tipo_material: m.tipo_material || '',
    material_critico: !!m.material_critico,
    proprietario_cliente_id: m.proprietario_cliente_id ? String(m.proprietario_cliente_id) : '',
    fabricante: m.fabricante || '', codigo_fabricante: m.codigo_fabricante || '', peso_unitario: m.peso_unitario ?? '',
    dimensoes: m.dimensoes || '', material_construtivo: m.material_construtivo || '', norma: m.norma || '',
    marca: m.marca || '', modelo: m.modelo || '', aplicacao: m.aplicacao || '', descricao_tecnica: m.descricao_tecnica || '',
    ponto_reposicao: m.ponto_reposicao ?? '', lote_economico: m.lote_economico ?? '',
    controle_lote: !!m.controle_lote, controle_serie: !!m.controle_serie, controle_validade: !!m.controle_validade,
    controle_corrida: !!m.controle_corrida, controle_certificado: !!m.controle_certificado,
    requer_inspecao: !!m.requer_inspecao, requer_foto: !!m.requer_foto,
    classe_abc: m.classe_abc || '', unidade_compra: m.unidade_compra || '', fator_conversao_compra: m.fator_conversao_compra ?? '',
  };
  const lidos = {};
  for (const c of CAMPOS_LIDOS) lidos[c] = m[c] === undefined ? null : m[c];
  return {
    form,
    corpo: (alteracoes = {}) => {
      const f = { ...form, ...alteracoes };
      return {
        ...f,
        familia_id: f.familia_id ? parseInt(f.familia_id, 10) : null,
        subfamilia_id: f.subfamilia_id ? parseInt(f.subfamilia_id, 10) : null,
        localizacao_padrao_id: f.localizacao_padrao_id ? parseInt(f.localizacao_padrao_id, 10) : null,
        classe_abc: f.classe_abc || null,
        proprietario_cliente_id: f.proprietario_cliente_id ? Number(f.proprietario_cliente_id) : null,
        fator_conversao_compra: f.unidade_compra ? f.fator_conversao_compra : null,
        controles_lidos: { controle_lote: !!m.controle_lote, controle_serie: !!m.controle_serie },
        familia_lida: { familia_id: m.familia_id ? Number(m.familia_id) : null, subfamilia_id: m.subfamilia_id ? Number(m.subfamilia_id) : null },
        campos_lidos: { ...lidos },
      };
    },
  };
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const F1 = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F125S', 'Familia S', 1)")).lastID;
  const LOC1 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('LS-1', 's', 1)")).lastID;
  const LOC2 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('LS-2', 's', 1)")).lastID;
  const CLI = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente S')")).lastID;
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `S125-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, categoria, quantidade_atual, quantidade_minima, custo_unitario, ativo, familia_id)
      VALUES (?, ?, 'PC', 'OUTROS', 0, 0, 10, 1, ?)`, [codigo, `Peca ${seq}`, F1])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const abrir = async (id) => { const r = await request(app).get(`/api/almoxarifado/materiais/${id}`); return formularioDe(r.body); };
  const outro = async (m, campos) => { for (const [k, v] of Object.entries(campos)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, m.id]); };
  const put = (id, body) => as(ALMOXARIFE, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);

  // (a) a lista inteira: cada coluna mudada SOZINHA por outro -> 409 com o rotulo dela
  const ROTULO = { codigo: 'Código', nome: 'Nome do Material', descricao: 'Descrição', descricao_tecnica: 'Descrição Técnica',
    categoria: 'Categoria', tipo_material: 'Tipo de Material', material_critico: 'Material crítico', proprietario_cliente_id: 'Proprietário',
    fabricante: 'Fabricante', codigo_fabricante: 'Código no Fabricante', marca: 'Marca', modelo: 'Modelo', norma: 'Norma Técnica',
    material_construtivo: 'Material Construtivo', peso_unitario: 'Peso Unitário', dimensoes: 'Dimensões', ncm: 'NCM', aplicacao: 'Aplicação',
    especificacoes: 'Especificações Técnicas', observacoes: 'Observações Gerais', unidade: 'Unidade de Medida', quantidade_minima: 'Estoque Mínimo',
    quantidade_maxima: 'Estoque Máximo', ponto_reposicao: 'Ponto de Reposição', lote_economico: 'Lote Econômico',
    localizacao_padrao_id: 'Localização no estoque', controle_validade: 'Controle de validade', controle_corrida: 'Controle de corrida',
    controle_certificado: 'Requer certificado', requer_inspecao: 'Requer inspeção', requer_foto: 'Requer foto', classe_abc: 'Classe ABC',
    custo_unitario: 'Custo Unitário', unidade_compra: 'Como é comprado', fator_conversao_compra: 'Como é comprado',
    fornecedor_principal: 'Fornecedor Principal', codigo_fornecedor: 'Código no Fornecedor' };
  const CAIXA = ['material_critico', 'controle_validade', 'controle_corrida', 'controle_certificado', 'requer_inspecao', 'requer_foto'];
  const NUM = ['peso_unitario', 'quantidade_minima', 'quantidade_maxima', 'ponto_reposicao', 'lote_economico', 'custo_unitario', 'fator_conversao_compra'];
  const novoValor = (col, m) => {
    if (CAIXA.includes(col)) return 1;
    if (NUM.includes(col)) return 7;
    if (col === 'localizacao_padrao_id') return LOC2;
    if (col === 'proprietario_cliente_id') return CLI;
    if (col === 'classe_abc') return 'A';
    if (col === 'unidade') return 'KG';
    if (col === 'codigo') return `${m.codigo}-N`;
    if (col === 'unidade_compra') return 'PCT';
    return 'valor do outro';
  };
  assert.deepStrictEqual(Object.keys(ROTULO), CAMPOS_LIDOS, 'a tabela da sonda nao cobre a lista');
  for (const col of CAMPOS_LIDOS) {
    await test(`[lista] ${col} mudado sozinho por outro -> 409 "${ROTULO[col]}"`, async () => {
      const m = await material({ localizacao_padrao_id: LOC1, unidade_compra: "CX", fator_conversao_compra: 12, peso_unitario: 3, ponto_reposicao: 3, lote_economico: 3 });
      const f = await abrir(m.id);
      await outro(m, { [col]: novoValor(col, m) });
      const r = await put(m.id, f.corpo({ nome: col === 'nome' ? 'Renomeada pelo form' : 'Renomeada' }));
      assert.strictEqual(r.status, 409, `gravado depois: ${JSON.stringify((await linha(m.id))[col])}; corpo mandou ${JSON.stringify(f.corpo()[col])}`);
      const cod = col === 'codigo' ? `${m.codigo}-N` : m.codigo;
      assert.strictEqual(r.body.error, E1(cod, [ROTULO[col]]));
    });
  }

  // (b) o usuario muda o custo pelo formulario (lido = gravado) -> 200 e o custo gravado
  await test('[custo] o usuario muda o custo, ninguem mais mexeu -> 200, custo novo', async () => {
    const m = await material();
    const f = await abrir(m.id);
    const r = await put(m.id, f.corpo({ custo_unitario: '15.5' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    assert.strictEqual((await linha(m.id)).custo_unitario, 15.5);
  });
  // (c) RN-02 do custo: o motor gravou 37.5, o usuario digitou 37.5 -> 200 (o WHERE compara com o gravado, nao o lido)
  await test('[custo] lido 10, motor gravou 37.5, o formulario manda 37.5 -> 200', async () => {
    const m = await material();
    const f = await abrir(m.id);
    await outro(m, { custo_unitario: 37.5 });
    const r = await put(m.id, f.corpo({ nome: 'Renomeada', custo_unitario: '37.5' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    assert.strictEqual((await linha(m.id)).custo_unitario, 37.5);
  });
  // (d) numero: de vazio para 0 por outro -> 409 (0 nao e vazio) — no Ponto de Reposicao (o minimo e o maximo tratam NULL como 0)
  await test('[numero] Ponto de Reposicao NULL -> 0 por outro, o usuario digita 5 -> 409 "Ponto de Reposição"', async () => {
    const m = await material({ ponto_reposicao: null });
    const f = await abrir(m.id);
    await outro(m, { ponto_reposicao: 0 });
    const r = await put(m.id, f.corpo({ ponto_reposicao: "5" }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body).slice(0, 200));
    assert.strictEqual(r.body.error, E1(m.codigo, ['Ponto de Reposição']));
  });
  // (d2) o minimo e o maximo: NULL vale 0 (Fase 5, r1 M1) — o 0 regravado pela aba Estoques minimos nao recusa
  await test('[numero0] Estoque Maximo NULL -> 0 (aba Estoques minimos), o usuario digita 5 -> 200', async () => {
    const m = await material({ quantidade_maxima: null });
    const f = await abrir(m.id);
    await outro(m, { quantidade_maxima: 0 });
    const r = await put(m.id, f.corpo({ quantidade_maxima: "5" }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  });
  // (e) numero: lido "4.50" (texto, outra representacao) com gravado 4.5, o usuario muda -> 200
  await test('[numero] lido "4.50" com gravado 4.5, o usuario muda para 6 -> 200', async () => {
    const m = await material({ quantidade_minima: 4.5 });
    const f = await abrir(m.id);
    const corpo = f.corpo({ quantidade_minima: '6' });
    corpo.campos_lidos.quantidade_minima = '4.50';
    const r = await put(m.id, corpo);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  });
  // (f) texto: so a caixa / um espaco do nome mudado por outro -> 409
  await test('[texto] outro so muda a caixa/espacos do nome -> 409', async () => {
    for (const novo of [(n) => n.toUpperCase(), (n) => `${n} `]) {
      const m = await material();
      const f = await abrir(m.id);
      const atual = (await linha(m.id)).nome;
      await outro(m, { nome: novo(atual) });
      const r = await put(m.id, f.corpo({ marca: 'mexeu' }));
      assert.strictEqual(r.status, 409, JSON.stringify(r.body).slice(0, 200));
    }
  });
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
