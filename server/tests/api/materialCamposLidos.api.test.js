/**
 * Etapa 125 (D (124), B805, B806) — o formulario de material manda os outros campos que leu (`campos_lidos`), e o salvar que
 * desfaria a mudanca feita por outra pessoa depois de o formulario abrir e recusado (RN-01..RN-07 do plano da Etapa 125).
 *
 * Antes: o formulario protegia os controles (116, `controles_lidos`) e a familia (124, `familia_lida`); o resto do cadastro era
 * gravado com o que o formulario mostrava ao abrir — medido na Fase 0: duas abas, uma troca a unidade e a outra so renomeia, as
 * duas 200 e a unidade desfeita; o custo que o recebimento gravou voltava ao do formulario.
 *
 * "Outra pessoa" = escrita direta no banco depois da "abertura" (ou o motor, RN-01d). Perfis EXPLICITOS: usuario sem perfil cai
 * em PRODUCAO.
 *
 * Executar: cd server && node tests/api/materialCamposLidos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
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
const E1F = (codigo) => `A família do material ${codigo} foi mudada por outra pessoa depois que você abriu o cadastro — salvar `
  + 'desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';
const E1C = (codigo) => `O controle por número de série do material ${codigo} foi ligado por outra pessoa depois `
  + 'que você abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';

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
  const F1 = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F125A', 'Familia 125 A', 1)")).lastID;
  const F2 = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F125B', 'Familia 125 B', 1)")).lastID;
  const LOC1 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('L125-1', 'e125', 1)")).lastID;
  const LOC2 = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('L125-2', 'e125', 1)")).lastID;
  const CLI = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E125')")).lastID;
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `E125-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, categoria, quantidade_atual, quantidade_minima, custo_unitario, ativo, familia_id)
      VALUES (?, ?, 'PC', 'OUTROS', 0, 0, 10, 1, ?)`, [codigo, `Peca ${seq}`, F1])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo, nome: `Peca ${seq}` };
  }
  const abrir = async (u, id) => {
    const r = await as(u, () => request(app).get(`/api/almoxarifado/materiais/${id}`));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return formularioDe(r.body);
  };
  /** A "outra pessoa": grava direto no banco, depois da abertura do formulario. */
  const outro = async (m, campos) => {
    for (const [k, v] of Object.entries(campos)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, m.id]);
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
  const auditorias = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND entidade_id = ?`, [id])).n;
  /** O 409 com nada gravado e sem Auditoria: a linha inteira igual a de antes do salvar. */
  const recusa = async (u, m, body, esperado) => {
    const aud = await auditorias(m.id);
    const antes = await linha(m.id);
    const r = await put(u, m.id, body);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperado);
    const depois = await linha(m.id);
    assert.deepStrictEqual({ ...depois, updated_at: null }, { ...antes, updated_at: null }, 'a recusa gravou alguma coisa');
    assert.strictEqual(await auditorias(m.id), aud, 'a recusa gravou auditoria');
  };

  // ── RN-01 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-01] nome mudado por outro: o Almoxarife salva renomeando com o lido -> 409 "Nome do Material", nada gravado', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { nome: 'Peca outro' });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Peca renomeada' }), E1(m.codigo, ['Nome do Material']));
  });

  await test('[RN-01] o Administrador (perfil) e o superadmin tambem recebem — nao e guarda de perfil', async () => {
    for (const u of [ADM_PERFIL, SUPER]) {
      const m = await material();
      const f = await abrir(u, m.id);
      await outro(m, { marca: 'Marca do outro' });
      await recusa(u, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Marca']));
    }
  });

  await test('[RN-01b] dois campos (Unidade, Estoque Minimo) -> plural, na ordem da lista', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { quantidade_minima: 7, unidade: 'KG' });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Unidade de Medida', 'Estoque Mínimo']));
  });

  await test('[RN-01b] tres campos -> "A", "B" e "C"; unidade de compra + quantidade por compra = um rotulo so', async () => {
    const m = await material({ unidade_compra: 'CX', fator_conversao_compra: 12 });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { descricao: 'desc do outro', unidade_compra: 'PCT', fator_conversao_compra: 50, codigo_fornecedor: 'FORN-9' });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }),
      E1(m.codigo, ['Descrição', 'Como é comprado', 'Código no Fornecedor']));
  });

  await test('[RN-01b] so a quantidade por compra mudada -> "Como é comprado"', async () => {
    const m = await material({ unidade_compra: 'CX', fator_conversao_compra: 12 });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { fator_conversao_compra: 24 });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Como é comprado']));
  });

  await test('[RN-01c] numero mandado como texto ("5" lido 0, outro gravou 9) -> "Estoque Mínimo"', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { quantidade_minima: 9 });
    await recusa(ALMOXARIFE, m, f.corpo({ quantidade_minima: '5' }), E1(m.codigo, ['Estoque Mínimo']));
  });

  await test('[RN-01c] caixa (material_critico ligado por outro, o formulario manda false) -> "Material crítico"', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { material_critico: 1 });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Material crítico']));
  });

  await test('[RN-01c] ids: localizacao trocada e proprietario posto por outro -> os dois rotulos', async () => {
    const m = await material({ localizacao_padrao_id: LOC1 });
    const f = await abrir(SUPER, m.id);
    await outro(m, { localizacao_padrao_id: LOC2, proprietario_cliente_id: CLI });
    await recusa(SUPER, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Proprietário', 'Localização no estoque']));
  });

  await test('[RN-01c] classe ABC posta por outro (o formulario manda null) -> "Classe ABC"', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { classe_abc: 'A' });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Classe ABC']));
  });

  await test('[RN-01c] texto apagado por outro (marca -> NULL), o formulario manda a marca lida -> "Marca"', async () => {
    const m = await material({ marca: 'Marca X' });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { marca: null });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Marca']));
  });

  await test('[RN-01c] codigo mudado por outro -> "Código", com o codigo GRAVADO na frase', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { codigo: `${m.codigo}-NOVO` });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(`${m.codigo}-NOVO`, ['Código']));
  });

  await test('[RN-01d] a entrada com custo (o motor grava o custo) com o formulario aberto -> "Custo Unitário", o custo novo fica', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await stockService.registrarMovimentacao(db, SUPER, { material_id: m.id, tipo: 'ENTRADA', quantidade: 2,
      custo_unitario: 37.5, motivo: 'compra' });
    assert.strictEqual((await linha(m.id)).custo_unitario, 37.5, 'o motor nao gravou o custo — o cenario nao existe');
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Custo Unitário']));
  });

  await test('[RN-01b] unidade de compra E quantidade por compra mudadas, so elas -> um rotulo, no SINGULAR (Fase 2, M3)', async () => {
    const m = await material({ unidade_compra: 'CX', fator_conversao_compra: 12 });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { unidade_compra: 'PCT', fator_conversao_compra: 50 });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Como é comprado']));
  });

  // RN-01e (Fase 2, M4): o custo que o recebimento grava ENTRE a leitura do `current` e o UPDATE. Injecao: embrulha `db.get` e,
  // depois da leitura do material pela rota, grava o custo (o "recebimento") — uma vez.
  const getOriginal = db.get.bind(db);
  let injecao = null;
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (injecao && s === 'SELECT * FROM materiais_almoxarifado WHERE id = ?') {
      const inj = injecao; injecao = null;
      return getOriginal(sql, params, (err, row) => { inj().then(() => cb(err, row), (e) => cb(e)); });
    }
    return getOriginal(sql, params, cb);
  };
  const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material e salve de novo.`;

  await test('[RN-01e] o custo gravado entre a leitura e o UPDATE, com custo_unitario lido -> o 409 geral, o custo novo fica', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    let rodou = false;
    injecao = async () => { rodou = true; await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_unitario = 55 WHERE id = ?', [m.id]); };
    const r = await put(ALMOXARIFE, m.id, f.corpo({ nome: 'Renomeada' }));
    assert.ok(rodou, 'a injecao nao rodou — teste vazio');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.custo_unitario], [m.nome, 55]);
  });

  await test('[RN-01e, Fase 5 r2 M1] outra coluna (unidade) gravada por outra aba entre a leitura e o UPDATE -> o 409 geral', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    let rodou = false;
    injecao = async () => { rodou = true; await dbRun(db, "UPDATE materiais_almoxarifado SET unidade = 'KG' WHERE id = ?", [m.id]); };
    const r = await put(ALMOXARIFE, m.id, f.corpo({ nome: 'Renomeada' }));
    assert.ok(rodou, 'a injecao nao rodou — teste vazio');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.unidade], [m.nome, 'KG']);
  });

  await test('[RN-01e] a mesma janela SEM custo_unitario em campos_lidos: o de antes (200, o custo do corpo) — o escopo', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    let rodou = false;
    injecao = async () => { rodou = true; await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_unitario = 55 WHERE id = ?', [m.id]); };
    const corpo = f.corpo({ nome: 'Renomeada' });
    delete corpo.campos_lidos.custo_unitario;
    const r = await put(ALMOXARIFE, m.id, corpo);
    assert.ok(rodou, 'a injecao nao rodou — teste vazio');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).custo_unitario, 10);
  });

  // ── RN-02 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-02] lido != gravado, mas o salvar grava o gravado (digitou o mesmo) -> 200', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { unidade: 'KG', quantidade_minima: 4 });
    const r = await put(ALMOXARIFE, m.id, f.corpo({ nome: 'Renomeada', unidade: 'KG', quantidade_minima: '4' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.unidade, l.quantidade_minima], ['Renomeada', 'KG', 4]);
  });

  await test('[RN-02] a chave omitida no corpo (preserve-when-omitted) -> 200, gravado intacto', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { unidade: 'KG' });
    const corpo = f.corpo({ nome: 'Renomeada' });
    delete corpo.unidade;
    const r = await put(ALMOXARIFE, m.id, corpo);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual([(await linha(m.id)).nome, (await linha(m.id)).unidade], ['Renomeada', 'KG']);
  });

  // ── RN-03 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-03] sem campos_lidos: o comportamento de antes (200, o corpo gravado) — API, Sobras, Remessas', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { unidade: 'KG' });
    const corpo = f.corpo({ nome: 'Antigo' });
    delete corpo.campos_lidos;
    const r = await put(ALMOXARIFE, m.id, corpo);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).unidade, 'PC');
  });

  await test('[RN-03] chave parcial: so `nome` lido; a unidade mudada por outro nao e comparada -> 200', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { unidade: 'KG' });
    const r = await put(ALMOXARIFE, m.id, { ...f.corpo({ nome: 'Parcial' }), campos_lidos: { nome: m.nome } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).unidade, 'PC');
  });

  await test('[RN-03] so `unidade` lida, mudada por outro: 409 (prova que a chave chega a rota)', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { unidade: 'KG' });
    await recusa(ALMOXARIFE, m, { ...f.corpo({ nome: 'Parcial' }), campos_lidos: { unidade: 'PC' } },
      E1(m.codigo, ['Unidade de Medida']));
  });

  await test('[RN-03] chaves fora da lista (quantidade_atual, familia_id, controle_lote, outra) nao sao comparadas -> 200', async () => {
    const m = await material({ quantidade_atual: 5 });
    const f = await abrir(ALMOXARIFE, m.id);
    const r = await put(ALMOXARIFE, m.id, { ...f.corpo({ nome: 'Fora' }), campos_lidos: { quantidade_atual: 99, familia_id: F2,
      controle_lote: 1, nome_qualquer: 'x' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, 'Fora');
  });

  await test('[RN-03] campos_lidos com valor de tipo invalido (objeto) -> 400 do schema, nada gravado', async () => {
    const m = await material();
    const r = await put(ALMOXARIFE, m.id, { nome: 'Invalido', campos_lidos: { nome: { x: 1 } } });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, m.nome);
  });

  // ── RN-04 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-04] lido = gravado, o usuario muda nome e unidade -> 200, gravado, ATUALIZACAO com o de/para (Fase 5, r1 M2: o plano dizia EDICAO)', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    const aud = await auditorias(m.id);
    const r = await put(ALMOXARIFE, m.id, f.corpo({ nome: 'Mudou', unidade: 'KG' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.unidade], ['Mudou', 'KG']);
    assert.strictEqual(await auditorias(m.id), aud + 1);
    const log = await dbGet(db, `SELECT acao, dados_anteriores, dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'material' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [m.id]);
    assert.strictEqual(log.acao, 'ATUALIZACAO');
    assert.deepStrictEqual([JSON.parse(log.dados_anteriores).unidade, JSON.parse(log.dados_novos).unidade], ['PC', 'KG']);
  });

  await test('[RN-05c, Fase 5 r1 M1] minimo/maximo NULL que a aba Estoques minimos regravou como 0: o usuario digita o maximo -> 200', async () => {
    const m = await material({ quantidade_minima: null, quantidade_maxima: null });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { quantidade_minima: 0, quantidade_maxima: 0 });
    const r = await put(ALMOXARIFE, m.id, f.corpo({ quantidade_maxima: '10' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).quantidade_maxima, 10);
    // metade positiva: o maximo mudado DE VERDADE por outro (NULL -> 5) continua recusado
    const m2 = await material({ quantidade_maxima: null });
    const f2 = await abrir(ALMOXARIFE, m2.id);
    await outro(m2, { quantidade_maxima: 5 });
    await recusa(ALMOXARIFE, m2, f2.corpo({ quantidade_maxima: '10' }), E1(m2.codigo, ['Estoque Máximo']));
  });

  // ── RN-05 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-05] o payload real do formulario, ninguem mudou nada: material com tudo NULL -> 200 (sem falso 409)', async () => {
    const m = await material();
    await outro(m, { unidade: null, categoria: 'OUTROS', custo_unitario: null, quantidade_minima: null });
    const f = await abrir(ALMOXARIFE, m.id);
    const r = await put(ALMOXARIFE, m.id, f.corpo());
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[RN-05] o payload real do formulario, ninguem mudou nada: material com tudo preenchido -> 200', async () => {
    const m = await material({ descricao: 'd', descricao_tecnica: 'dt', tipo_material: 't', material_critico: 1,
      proprietario_cliente_id: CLI, fabricante: 'fa', codigo_fabricante: 'cf', marca: 'ma', modelo: 'mo', norma: 'no',
      material_construtivo: 'mc', peso_unitario: 1.25, dimensoes: '10x10', ncm: '1234', aplicacao: 'ap', especificacoes: 'es',
      observacoes: 'ob', quantidade_minima: 2.5, quantidade_maxima: 20, ponto_reposicao: 5, lote_economico: 10,
      localizacao_padrao_id: LOC1, controle_validade: 1, controle_corrida: 1, controle_certificado: 1, requer_inspecao: 1,
      requer_foto: 1, classe_abc: 'B', custo_unitario: 12.3456, unidade_compra: 'CX', fator_conversao_compra: 12,
      fornecedor_principal: 'fp', codigo_fornecedor: 'cfo' });
    const f = await abrir(SUPER, m.id);
    const r = await put(SUPER, m.id, f.corpo());
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    // e o formulario como o usuario digita (numeros como texto)
    const f2 = await abrir(SUPER, m.id);
    const r2 = await put(SUPER, m.id, f2.corpo({ quantidade_minima: '2.5', custo_unitario: '12.3456', peso_unitario: '1.25' }));
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
  });

  // RN-05b: o lido numa outra representacao que VALE o mesmo que o gravado (a API, ou um cliente que guardou o lido do estado) e o
  // usuario muda o campo -> 200. Sem a normalizacao de cada tipo, o lido "diferente" + o salvar mudando = falso 409. Um por tipo.
  const lidoEquivalente = async (extra, col, lidoEquiv, novoValor) => {
    const m = await material(extra);
    const f = await abrir(ALMOXARIFE, m.id);
    const corpo = f.corpo({ [col]: novoValor });
    corpo.campos_lidos[col] = lidoEquiv;
    const r = await put(ALMOXARIFE, m.id, corpo);
    assert.strictEqual(r.status, 200, `${col}: ${JSON.stringify(r.body)}`);
  };
  await test('[RN-05b] texto: lido "" com gravado NULL, o usuario preenche -> 200', async () => {
    await lidoEquivalente({ marca: null }, 'marca', '', 'Marca nova');
  });
  await test('[RN-05b] numero: lido "4" (texto) com gravado 4, o usuario muda para 6 -> 200', async () => {
    await lidoEquivalente({ quantidade_minima: 4 }, 'quantidade_minima', '4', '6');
  });
  await test('[RN-05b] caixa: lido true com gravado 1, o usuario desmarca -> 200', async () => {
    await lidoEquivalente({ material_critico: 1 }, 'material_critico', true, false);
  });
  await test('[RN-05b] id: lido "⟨id⟩" (texto) com gravado o numero, o usuario troca a localizacao -> 200', async () => {
    await lidoEquivalente({ localizacao_padrao_id: LOC1 }, 'localizacao_padrao_id', String(LOC1), String(LOC2));
  });
  await test('[RN-02] texto apagado pelos dois (outro grava NULL, o formulario manda "") -> 200, nada desfeito', async () => {
    const m = await material({ marca: 'Marca X' });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { marca: null });
    const r = await put(ALMOXARIFE, m.id, f.corpo({ marca: '' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  // ── RN-06 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-06a] controles E campos mudados por outro: o 409 da C233', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { controle_serie: 1, nome: 'Peca outro' });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1C(m.codigo));
  });

  await test('[RN-06b] familia E campos mudados por outro: E1f (124)', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { familia_id: F2, nome: 'Peca outro' });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1F(m.codigo));
  });

  await test('[RN-06c] campos mudados E troca de dono proibida (material com saldo): E1, nao o 403', async () => {
    const m = await material({ quantidade_atual: 3 });
    const f = await abrir(ALMOXARIFE, m.id);
    // controle: sem o campo mudado, a troca de dono do Almoxarife e recusada (403) — prova que o cenario a alcanca
    const sem = await put(ALMOXARIFE, m.id, f.corpo({ proprietario_cliente_id: String(CLI) }));
    assert.strictEqual(sem.status, 403, JSON.stringify(sem.body));
    await outro(m, { marca: 'Marca do outro' });
    await recusa(ALMOXARIFE, m, f.corpo({ proprietario_cliente_id: String(CLI) }), E1(m.codigo, ['Marca']));
  });

  await test('[RN-06d] o Administrador trocou o dono; o Almoxarife salva com o lido -> 409 "Proprietário", nao o 403', async () => {
    const m = await material({ quantidade_atual: 3 });
    const f = await abrir(ALMOXARIFE, m.id);
    await outro(m, { proprietario_cliente_id: CLI });
    await recusa(ALMOXARIFE, m, f.corpo({ nome: 'Renomeada' }), E1(m.codigo, ['Proprietário']));
    assert.strictEqual((await linha(m.id)).proprietario_cliente_id, CLI);
  });

  await test('[RN-06e] campos mudados E inativar com saldo: E1, nao o 400 do saldo', async () => {
    const m = await material({ quantidade_atual: 3 });
    const f = await abrir(ALMOXARIFE, m.id);
    const sem = await put(ALMOXARIFE, m.id, { ...f.corpo(), ativo: 0 });
    assert.strictEqual(sem.status, 400, JSON.stringify(sem.body));
    await outro(m, { modelo: 'Modelo do outro' });
    await recusa(ALMOXARIFE, m, { ...f.corpo(), ativo: 0 }, E1(m.codigo, ['Modelo']));
  });

  // ── RN-07 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-07] campos_lidos falso nao autoriza: lido = gravado e localizacao inexistente no corpo -> a recusa de sempre', async () => {
    const m = await material();
    const f = await abrir(ALMOXARIFE, m.id);
    const r = await put(ALMOXARIFE, m.id, f.corpo({ localizacao_padrao_id: '999999' }));
    assert.notStrictEqual(r.status, 200, JSON.stringify(r.body));
    assert.notStrictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).localizacao_padrao_id, null);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
