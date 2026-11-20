/**
 * Etapa 252 (item 19, C497) — a recusa da entrega com duas pecas da mesma requisicao no mesmo endereco diz que o resto e da outra peca.
 *
 * RN-252.10: item que ESCOLHEU a origem, o fisico cobriria a quantidade se outra peca desta entrega nao pedisse dali, e com ela nao cobre ->
 *   "<material>: em <A>[, lote <L>] ha <fisico> para esta entrega, mas <ja> sai(em) dali nesta entrega para outra(s) peca(s) desta
 *   requisicao; sobra <fisico - ja>, que nao cobre a quantidade (<q>). Escolha outro endereco ou deixe "Qualquer endereco (automatico)"".
 * RN-252.11: o fisico sozinho nao cobre, ou nada foi pedido dali nesta entrega, ou a planejada num clique -> a literal de antes. Nada
 *   muda no que e aceito.
 * Plano: docs/superpowers/plans/2026-11-19-almoxarifado-etapa252-endereco-da-troca-frase-do-irmao-e-serie.md
 *
 * Executar: cd server && node tests/api/entregaFraseDoIrmao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`); });
}

const ADMIN = { id: 1, nome: 'Adm 252F', role: 'admin', is_superadmin: 1, email: 'a252f@t.com' };
const API = '/api/almoxarifado';
const CONSELHO = 'Escolha outro endereço ou deixe "Qualquer endereço (automático)"';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 252 (C497): a frase de duas pecas no mesmo endereco ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });
  await dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES ('aprovacao_automatica','0')
    ON CONFLICT(chave) DO UPDATE SET valor='0'`);
  const alm = await request(app).post(`${API}/almoxarifados`).send({ codigo: 'ALM252F', nome: 'Almox 252 F' });
  assert.ok(alm.status === 201 || alm.status === 200, JSON.stringify(alm.body));
  const loc = async (codigo) => {
    const r = await request(app).post(`${API}/localizacoes`).send({ codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    assert.ok(r.status === 201 || r.status === 200, `localizacao ${codigo}: ${JSON.stringify(r.body)}`);
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('TF-A'); const B = await loc('TF-B'); const P = await loc('TF-P');
  const material = async ({ lote = false } = {}) => {
    const c = `E252F-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, permite_saldo_negativo, localizacao_padrao_id)
        VALUES (?, ?, 'un', 0, 0, 1, 0, 0.1, ?, 0, 0, ?)`, [c, c, lote ? 1 : 0, P.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e252',
      localizacao_destino_id: destino, ...(lote ? { lote } : {}) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m.id, codigo])).id;
  const reqDireta = async (itens) => {
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E252F-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      // eslint-disable-next-line no-await-in-loop
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
        quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID);
    }
    return { R, ids };
  };
  const separar = async (R, linhas) => {
    const r = await request(app).put(`${API}/requisicoes/${R}/separacao`).send({ itens_separados: linhas });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  };
  const entregar = (R, linhas) => request(app).put(`${API}/requisicoes/${R}/entregar`).send({ itens_atendidos: linhas });
  const recusa = async (R, linhas) => {
    const r = await entregar(R, linhas);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    return r.body.error;
  };
  const saidas = async (R) => Number((await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE requisicao_id = ?
    AND tipo = 'SAIDA'`, [R])).n);

  // A 3, B 5; item 1 (3) separado sem origem; item 2 (2) separado de A.
  const cenario = async ({ fisicoA = 3, parte2 = 2, q1 = 3 } = {}) => {
    const m = await material();
    await entrar(m, A.id, fisicoA); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, q1], [m.id, parte2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: q1 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: parte2, localizacao_origem_id: A.id }]);
    return { m, R, ids };
  };

  await test('[RN-252.10 a] C497: item 1 com Sai de A e 3, item 2 num clique (2 de A) -> a frase diz que 2 saem para a outra peca; nada gravado', async () => {
    const { m, R, ids } = await cenario();
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(msg, `${m.nome}: em TF-A há 3 para esta entrega, mas 2 saem dali nesta entrega para outra peça desta requisição; `
      + `sobra 1, que não cobre a quantidade (3). ${CONSELHO}`);
    assert.strictEqual(await saidas(R), 0);
  });

  await test('[RN-252.10 b] 2 + 2 com A 3 -> sobra 1, que nao cobre a quantidade (2); 1 + 2 passa (metade positiva)', async () => {
    const { m, R, ids } = await cenario();
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(msg, `${m.nome}: em TF-A há 3 para esta entrega, mas 2 saem dali nesta entrega para outra peça desta requisição; `
      + `sobra 1, que não cobre a quantidade (2). ${CONSELHO}`);
    const r = await entregar(R, [{ item_id: ids[0], quantidade_atendida: 1, localizacao_origem_id: A.id }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[RN-252.10 c] singular: A 2, item 2 separado 1 de A, item 1 pede 2 de A -> "1 sai dali"', async () => {
    const { m, R, ids } = await cenario({ fisicoA: 2, parte2: 1, q1: 2 });
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id }, { item_id: ids[1], quantidade_atendida: 1 }]);
    assert.strictEqual(msg, `${m.nome}: em TF-A há 2 para esta entrega, mas 1 sai dali nesta entrega para outra peça desta requisição; `
      + `sobra 1, que não cobre a quantidade (2). ${CONSELHO}`);
  });

  await test('[RN-252.10 d] plural: A 5, itens 2 e 3 separados 2 + 2 de A, item 1 pede 3 de A -> "4 saem ... para outras peças"', async () => {
    const m = await material();
    await entrar(m, A.id, 5); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id },
      { item_id: ids[2], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id },
      { item_id: ids[1], quantidade_atendida: 2 }, { item_id: ids[2], quantidade_atendida: 2 }]);
    assert.strictEqual(msg, `${m.nome}: em TF-A há 5 para esta entrega, mas 4 saem dali nesta entrega para outras peças desta requisição; `
      + `sobra 1, que não cobre a quantidade (3). ${CONSELHO}`);
  });

  await test('[RN-252.10 e] com lote: L1 3 em A, item 2 separado 2 de (A, L1), item 1 com Sai de (A, L1) e 3 -> "em TF-A, lote L1 há 3"', async () => {
    const m = await material({ lote: true });
    await entrar(m, A.id, 3, 'L1'); await entrar(m, B.id, 5, 'L2');
    const l1 = await loteId(m, 'L1');
    const { R, ids } = await reqDireta([[m.id, 3], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    await separar(R, [{ item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]);
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id, lote_id: l1 },
      { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(msg, `${m.nome}: em TF-A, lote L1 há 3 para esta entrega, mas 2 saem dali nesta entrega para outra peça desta `
      + `requisição; sobra 1, que não cobre a quantidade (3). ${CONSELHO}`);
  });

  await test('[RN-252.11 a] o fisico sozinho nao cobre (A 2, item 1 pede 3) -> a literal de antes', async () => {
    const { m, R, ids } = await cenario({ fisicoA: 2 });
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(msg, `${m.nome}: O saldo em TF-A (0) não cobre a quantidade (3) — a saída tiraria de outros endereços`);
  });

  await test('[RN-252.11 b] nada pedido dali nesta entrega (o item 2 fica de fora) e A 1 -> a literal de antes', async () => {
    const m = await material();
    await entrar(m, A.id, 1); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 3]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 3 }]);
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 3, localizacao_origem_id: A.id }]);
    assert.strictEqual(msg, `${m.nome}: O saldo em TF-A (1) não cobre a quantidade (3) — a saída tiraria de outros endereços`);
  });

  await test('[RN-252.11 c] a planejada num clique continua com "nao serve mais" (dois itens separados de A; A baixou para 3)', async () => {
    const m = await material();
    await entrar(m, A.id, 4); await entrar(m, B.id, 5);
    const { R, ids } = await reqDireta([[m.id, 2], [m.id, 2]]);
    await separar(R, [{ item_id: ids[0], quantidade_separada: 2, localizacao_origem_id: A.id },
      { item_id: ids[1], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    const s = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: m.id, tipo: 'SAIDA', quantidade: 1, motivo: 'e252',
      justificativa: 'e252', localizacao_origem_id: A.id });
    assert.strictEqual(s.status, 201, JSON.stringify(s.body));
    const msg = await recusa(R, [{ item_id: ids[0], quantidade_atendida: 2 }, { item_id: ids[1], quantidade_atendida: 2 }]);
    assert.strictEqual(msg, `${m.nome}: a origem da separação (TF-A) não serve mais (O saldo em TF-A (1) não cobre a quantidade (2) — a `
      + 'saída tiraria de outros endereços) — entregue escolhendo de onde sai');
  });

  console.log(`\nResultado: ${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
